-- =================================================================================
-- PHASE 6: CLINICAL LOGIC HARDENING & BRANDING ALIGNMENT
-- 1. Updates rpc_create_clinical_visit to link appointments & use new branding
-- 2. Updates rpc_process_clinical_action to update appointments & trigger no-show scoring
-- =================================================================================

-- 1. UPGRADE REGISTRATION RPC
CREATE OR REPLACE FUNCTION public.rpc_create_clinical_visit(
    p_clinic_id uuid,
    p_session_id uuid,
    p_patient_name text,
    p_patient_phone text,
    p_phone_encrypted text,
    p_phone_hash text,
    p_visit_type text DEFAULT 'OPD',
    p_is_priority boolean DEFAULT false,
    p_staff_id uuid DEFAULT NULL,
    p_source text DEFAULT 'QR',
    p_department_id uuid DEFAULT NULL,
    p_requested_doctor_id uuid DEFAULT NULL
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
    v_appt_id uuid;
    v_priority_score int;
BEGIN
    -- 1. STRICT SESSION LOCK
    PERFORM id FROM public.sessions 
    WHERE id = p_session_id AND business_id = p_clinic_id AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Queue session is closed or invalid.');
    END IF;

    -- 2. PATIENT LOOKUP / CREATION (DPDP Compliant)
    IF p_phone_hash IS NOT NULL THEN
        SELECT id INTO v_patient_id FROM public.patients 
        WHERE clinic_id = p_clinic_id AND phone_hash = p_phone_hash;
    END IF;

    IF v_patient_id IS NULL THEN
        INSERT INTO public.patients (clinic_id, name, phone, phone_encrypted, phone_hash)
        VALUES (p_clinic_id, p_patient_name, p_patient_phone, p_phone_encrypted, p_phone_hash)
        RETURNING id INTO v_patient_id;
    END IF;

    -- 3. CONSENT LOGGING (Updated Branding: OPD_ORCHESTRATION)
    INSERT INTO public.patient_consents (patient_id, clinic_id, purpose, digital_signature)
    VALUES (v_patient_id, p_clinic_id, 'OPD_ORCHESTRATION', 'IP_THRU_NEXTJS_PROXY');

    -- 4. CAPACITY CHECK (Sibtain.md L123: Daily limits)
    SELECT daily_token_limit INTO v_limit FROM public.businesses WHERE id = p_clinic_id;
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count FROM public.clinical_visits WHERE session_id = p_session_id;
        IF v_issued_count >= v_limit THEN
            RETURN json_build_object('success', false, 'error', 'Clinic daily capacity reached.', 'limit_reached', true);
        END IF;
    END IF;

    -- 5. DE-DUPLICATION
    SELECT id INTO v_existing_visit_id FROM public.clinical_visits 
    WHERE session_id = p_session_id AND patient_id = v_patient_id AND status IN ('WAITING', 'SERVING', 'SKIPPED');
    IF FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Patient already has an active visit.', 'is_duplicate', true, 'visit_id', v_existing_visit_id);
    END IF;

    -- 6. APPOINTMENT LINKING (Virtual Hold Resolution)
    -- Look for a scheduled appointment for this patient today
    SELECT id INTO v_appt_id FROM public.appointments 
    WHERE patient_id = v_patient_id 
      AND clinic_id = p_clinic_id 
      AND slot_date = CURRENT_DATE
      AND status = 'SCHEDULED'
    LIMIT 1;

    -- 7. ATOMIC ALLOCATION & SCORING (Phase 4 Logic)
    -- If no doctor requested, use LEAST_BUSY strategy for the department
    IF p_requested_doctor_id IS NULL AND p_department_id IS NOT NULL THEN
        p_requested_doctor_id := public.rpc_allocate_doctor(p_session_id, p_department_id, NULL, 'LEAST_BUSY');
    END IF;

    -- Calculate initial priority score (Acuity Aware)
    v_priority_score := public.rpc_calculate_priority_score(p_visit_type, p_is_priority, 0, 0);

    -- 8. ATOMIC INCREMENT
    UPDATE public.sessions SET last_token_number = last_token_number + 1
    WHERE id = p_session_id
    RETURNING last_token_number INTO v_token_number;

    -- 9. INSERT CLINICAL VISIT
    INSERT INTO public.clinical_visits (
        clinic_id, session_id, patient_id, token_number, 
        visit_type_v2, is_priority, priority_score,
        created_by_staff_id, arrival_at_department_time, 
        department_id, requested_doctor_id, assigned_doctor_id
    ) VALUES (
        p_clinic_id, p_session_id, v_patient_id, v_token_number, 
        p_visit_type, p_is_priority, v_priority_score,
        p_staff_id, now(), 
        p_department_id, p_requested_doctor_id, p_requested_doctor_id
    ) RETURNING id INTO v_visit_id;

    -- 10. UPDATE APPOINTMENT IF LINKED
    IF v_appt_id IS NOT NULL THEN
        UPDATE public.appointments SET 
            status = 'CHECKED_IN', 
            visit_id = v_visit_id, 
            is_virtual_hold = false 
        WHERE id = v_appt_id;
    END IF;

    -- 11. BILLING & USAGE METERING
    PERFORM public.fn_increment_usage(p_clinic_id, 'TOKEN');

    RETURN json_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'patient_id', v_patient_id,
        'token_number', v_token_number,
        'assigned_doctor_id', p_requested_doctor_id,
        'priority_score', v_priority_score,
        'appointment_linked', v_appt_id IS NOT NULL
    );
END;
$$;


-- 2. UPGRADE MUTATION RPC
CREATE OR REPLACE FUNCTION public.rpc_process_clinical_action(
    p_clinic_id uuid,
    p_session_id uuid,
    p_staff_id uuid,
    p_action text,
    p_visit_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_serving_id uuid;
    v_next_visit_id uuid;
    v_appt_id uuid;
BEGIN
    -- 1. Lock Session
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_clinic_id FOR UPDATE;

    -- ACTION: NEXT
    IF p_action = 'NEXT' THEN
        SELECT id INTO v_current_serving_id FROM public.clinical_visits WHERE session_id = p_session_id AND status = 'SERVING' LIMIT 1;
        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.clinical_visits 
            SET previous_status = status, status = 'SERVED', discharge_completed_time = now() 
            WHERE id = v_current_serving_id;
            
            -- Resolve Appointment (if linked)
            SELECT id INTO v_appt_id FROM public.appointments WHERE visit_id = v_current_serving_id;
            IF v_appt_id IS NOT NULL THEN
                UPDATE public.appointments SET status = 'COMPLETED' WHERE id = v_appt_id;
                PERFORM public.rpc_update_noshowprob(v_appt_id);
            END IF;
        END IF;

        -- Find next (Priority-Aware & Load Balanced)
        -- Support doctor-scoped NEXT if p_staff_id is linked to a doctor
        SELECT id INTO v_next_visit_id FROM public.clinical_visits
        WHERE session_id = p_session_id 
          AND status = 'WAITING'
          AND (
            p_staff_id IS NULL OR 
            assigned_doctor_id IN (SELECT id FROM public.doctors WHERE staff_id = p_staff_id) OR
            assigned_doctor_id IS NULL
          )
        ORDER BY priority_score DESC, token_number ASC LIMIT 1;

        IF v_next_visit_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Queue is empty'); END IF;

        UPDATE public.clinical_visits SET previous_status = status, status = 'SERVING', consultant_assessment_start_time = now() WHERE id = v_next_visit_id;
        RETURN json_build_object('success', true, 'visit_id', v_next_visit_id);

    -- ACTION: ARRIVE (Mark as physically present)
    ELSIF p_action = 'ARRIVE' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits 
        SET is_arrived = true, 
            arrival_at_department_time = COALESCE(arrival_at_department_time, now())
        WHERE id = p_visit_id;
        RETURN json_build_object('success', true);

    -- ACTION: SKIP (Mark as No-Show for appointment)
    ELSIF p_action = 'SKIP' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits SET previous_status = status, status = 'SKIPPED' WHERE id = p_visit_id;
        
        SELECT id INTO v_appt_id FROM public.appointments WHERE visit_id = p_visit_id;
        IF v_appt_id IS NOT NULL THEN
            UPDATE public.appointments SET status = 'NO_SHOW' WHERE id = v_appt_id;
            PERFORM public.rpc_update_noshowprob(v_appt_id);
        END IF;
        
        RETURN json_build_object('success', true);

    -- ACTION: CANCEL
    ELSIF p_action = 'CANCEL' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits SET previous_status = status, status = 'CANCELLED' WHERE id = p_visit_id;
        
        SELECT id INTO v_appt_id FROM public.appointments WHERE visit_id = p_visit_id;
        IF v_appt_id IS NOT NULL THEN
            UPDATE public.appointments SET status = 'CANCELLED' WHERE id = v_appt_id;
        END IF;
        
        RETURN json_build_object('success', true);

    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid action');
    END IF;
END;
$$;
