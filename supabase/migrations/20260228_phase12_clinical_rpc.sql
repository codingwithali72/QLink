-- =================================================================================
-- PHASE 12: CLINICAL VISIT ATOMIC RPC
-- Handles the complex transaction of Patient Lookup/Creation + Consent + Visit Registration.
-- =================================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_clinical_visit(
    p_clinic_id uuid,
    p_session_id uuid,
    p_patient_name text,
    p_patient_phone text, -- plaintext for backcompat/processing
    p_phone_encrypted text,
    p_phone_hash text,
    p_visit_type text DEFAULT 'OPD',
    p_is_priority boolean DEFAULT false,
    p_staff_id uuid DEFAULT NULL,
    p_source text DEFAULT 'QR'
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
BEGIN
    -- 1. STRICT SESSION LOCK
    -- Prevents race conditions on token_number and daily limits
    PERFORM id FROM public.sessions 
    WHERE id = p_session_id AND business_id = p_clinic_id AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Queue session is closed or invalid.');
    END IF;

    -- 2. PATIENT LOOKUP / CREATION (DPDP Compliant)
    -- Try to find patient by phone_hash within this clinic
    IF p_phone_hash IS NOT NULL THEN
        SELECT id INTO v_patient_id FROM public.patients 
        WHERE clinic_id = p_clinic_id AND phone_hash = p_phone_hash;
    END IF;

    IF v_patient_id IS NULL THEN
        INSERT INTO public.patients (clinic_id, name, phone, phone_encrypted, phone_hash)
        VALUES (p_clinic_id, p_patient_name, p_patient_phone, p_phone_encrypted, p_phone_hash)
        RETURNING id INTO v_patient_id;
    END IF;

    -- 3. CONSENT LOGGING
    INSERT INTO public.patient_consents (patient_id, clinic_id, purpose, digital_signature)
    VALUES (v_patient_id, p_clinic_id, 'QUEUE_MANAGEMENT', 'IP_THRU_NEXTJS_PROXY');

    -- 4. CAPACITY CHECK
    SELECT daily_token_limit INTO v_limit FROM public.businesses WHERE id = p_clinic_id;
    
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count FROM public.clinical_visits WHERE session_id = p_session_id;
        IF v_issued_count >= v_limit THEN
            RETURN json_build_object('success', false, 'error', 'Clinic daily capacity reached.', 'limit_reached', true);
        END IF;
    END IF;

    -- 5. DE-DUPLICATION (One active visit per session for the same patient)
    SELECT id INTO v_existing_visit_id FROM public.clinical_visits 
    WHERE session_id = p_session_id AND patient_id = v_patient_id AND status IN ('WAITING', 'TRIAGE_PENDING', 'SERVING', 'SKIPPED');

    IF FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Patient already has an active visit.', 'is_duplicate', true, 'visit_id', v_existing_visit_id);
    END IF;

    -- 6. ATOMIC INCREMENT
    UPDATE public.sessions SET last_token_number = last_token_number + 1
    WHERE id = p_session_id
    RETURNING last_token_number INTO v_token_number;

    -- 7. INSERT CLINICAL VISIT
    INSERT INTO public.clinical_visits (
        clinic_id, session_id, patient_id, token_number, visit_type, is_priority, created_by_staff_id, arrival_at_department_time
    ) VALUES (
        p_clinic_id, p_session_id, v_patient_id, v_token_number, p_visit_type, p_is_priority, p_staff_id, now()
    ) RETURNING id INTO v_visit_id;

    -- 8. SECURITY AUDIT
    INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id, metadata)
    VALUES (p_clinic_id, p_staff_id, 'VISIT_CREATED', 'clinical_visits', v_visit_id, jsonb_build_object('token', v_token_number, 'source', p_source));

    RETURN json_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'patient_id', v_patient_id,
        'token_number', v_token_number
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
