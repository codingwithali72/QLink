-- =================================================================================
-- HOSPITAL TRANSFORMATION 003: Queue Engine Hardening (RPC)
-- Implements Phase 2.1 & 2.2 of the Execution Mandate
-- =================================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_clinical_visit(
    p_clinic_id uuid,
    p_session_id uuid,
    p_patient_name text,
    p_patient_phone text,
    p_phone_encrypted text,
    p_phone_hash text,
    p_department_id uuid,          -- NEW: Target Department
    p_requested_doctor_id uuid DEFAULT NULL, -- NEW: Direct doctor booking
    p_visit_type text DEFAULT 'OPD',
    p_is_priority boolean DEFAULT false,
    p_staff_id uuid DEFAULT NULL,
    p_source text DEFAULT 'WALK_IN', -- WALK_IN, APPOINTMENT
    p_appointment_time timestamp with time zone DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patient_id uuid;
    v_token_number int;
    v_visit_id uuid;
    v_limit int;
    v_issued_count int;
    v_existing_visit_id uuid;
    v_assigned_doctor_id uuid;
    v_routing_strategy text;
BEGIN
    -- 1. STRICT SESSION LOCK
    -- Locks the session row to prevent any concurrent race conditions across the whole clinic
    PERFORM id FROM public.sessions 
    WHERE id = p_session_id AND business_id = p_clinic_id AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Queue session is closed or invalid.');
    END IF;

    -- 2. PATIENT LOOKUP / CREATION
    IF p_phone_hash IS NOT NULL THEN
        SELECT id INTO v_patient_id FROM public.patients 
        WHERE clinic_id = p_clinic_id AND phone_hash = p_phone_hash;
    END IF;

    IF v_patient_id IS NULL THEN
        INSERT INTO public.patients (clinic_id, name, phone, phone_encrypted, phone_hash)
        VALUES (p_clinic_id, p_patient_name, p_patient_phone, p_phone_encrypted, p_phone_hash)
        RETURNING id INTO v_patient_id;
    END IF;

    -- 3. CONSENT LOGGING (Only if Walk-in; Appointments handle consent on booking)
    IF p_source = 'WALK_IN' THEN
        INSERT INTO public.patient_consents (patient_id, clinic_id, purpose, digital_signature)
        VALUES (v_patient_id, p_clinic_id, 'QUEUE_MANAGEMENT', 'WALK_IN_RECEPTION');
    END IF;

    -- 4. CAPACITY CHECK (Overall Clinic)
    SELECT daily_token_limit INTO v_limit FROM public.businesses WHERE id = p_clinic_id;
    
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count FROM public.clinical_visits WHERE session_id = p_session_id;
        IF v_issued_count >= v_limit THEN
            RETURN json_build_object('success', false, 'error', 'Clinic daily capacity reached.', 'limit_reached', true);
        END IF;
    END IF;

    -- 5. DE-DUPLICATION (One active visit per DEPARTMENT for the same patient)
    SELECT id INTO v_existing_visit_id FROM public.clinical_visits 
    WHERE session_id = p_session_id AND patient_id = v_patient_id AND department_id = p_department_id
    AND status IN ('WAITING', 'TRIAGE_PENDING', 'SERVING', 'SKIPPED', 'PAUSED');

    IF FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Patient already has an active visit in this department.', 'is_duplicate', true, 'visit_id', v_existing_visit_id);
    END IF;

    -- 6. DOCTOR ROUTING (Smart Load Balancing)
    SELECT routing_strategy INTO v_routing_strategy FROM public.departments WHERE id = p_department_id;

    IF p_requested_doctor_id IS NOT NULL THEN
        -- Explicit doctor requested
        v_assigned_doctor_id := p_requested_doctor_id;
    ELSIF v_routing_strategy = 'POOLED' THEN
        -- Find the doctor with the least active patients in this department
        SELECT d.id INTO v_assigned_doctor_id
        FROM public.doctors d
        LEFT JOIN public.clinical_visits cv ON cv.doctor_id = d.id AND cv.status IN ('WAITING', 'SERVING')
        WHERE d.department_id = p_department_id AND d.is_active = true
        GROUP BY d.id
        ORDER BY count(cv.id) ASC
        LIMIT 1;
    END IF;

    -- 7. ATOMIC TOKAM INCREMENT (Per Department, NOT global session)
    -- Instead of `sessions.last_token_number`, we must calculate the max for this department
    -- Since we hold the session lock (Step 1), this SELECT MAX() is totally safe from race conditions.
    SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_token_number
    FROM public.clinical_visits
    WHERE session_id = p_session_id AND department_id = p_department_id;

    -- 8. INSERT CLINICAL VISIT
    INSERT INTO public.clinical_visits (
        clinic_id, session_id, patient_id, department_id, doctor_id,
        token_number, visit_type, is_priority, source, appointment_time,
        estimated_service_time, arrival_at_department_time, created_by_staff_id
    ) VALUES (
        p_clinic_id, p_session_id, v_patient_id, p_department_id, v_assigned_doctor_id,
        v_token_number, p_visit_type, p_is_priority, p_source, p_appointment_time,
        -- Merge Logic: Base estimated time on NOW or APPOINTMENT TIME
        COALESCE(p_appointment_time, now()), 
        now(), p_staff_id
    ) RETURNING id INTO v_visit_id;

    -- 9. SECURITY AUDIT
    INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id, metadata)
    VALUES (p_clinic_id, p_staff_id, 'VISIT_CREATED', 'clinical_visits', v_visit_id, 
        jsonb_build_object(
            'token', v_token_number, 
            'dept', p_department_id, 
            'doc', v_assigned_doctor_id, 
            'source', p_source
        )
    );

    RETURN json_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'patient_id', v_patient_id,
        'token_number', v_token_number,
        'assigned_doctor_id', v_assigned_doctor_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
