-- =================================================================================
-- PHASE 3: NABH TRIAGE & CLINICAL LOGIC ENGINE
-- ESI Acuity Engine, dynamic reordering, and SLA breach triggers
-- =================================================================================

-- 1. Helper Function: Get ESI SLA Minutes
CREATE OR REPLACE FUNCTION public.get_esi_sla_minutes(p_esi_level int)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_esi_level
        WHEN 1 THEN 0   -- Resuscitation: Immediate
        WHEN 2 THEN 10  -- Emergent: < 10 mins
        WHEN 3 THEN 60  -- Urgent: < 60 mins
        WHEN 4 THEN 120 -- Less Urgent: < 120 mins
        WHEN 5 THEN 240 -- Non-Urgent: < 240 mins
        ELSE 240        -- Unknown defaults to lowest acuity
    END;
END;
$$;

-- 2. Trigger: Auto-populate max_permissible_wait_mins on Triage Insert/Update
CREATE OR REPLACE FUNCTION public.fn_set_triage_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.max_permissible_wait_mins := public.get_esi_sla_minutes(NEW.triage_level);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_triage_sla
BEFORE INSERT OR UPDATE OF triage_level ON public.triage_records
FOR EACH ROW EXECUTE FUNCTION public.fn_set_triage_sla();


-- 3. Core Engine: Get Next Patient (Real-Time Acuity Reordering)
-- Overrides the old FIFO method. This logic pulls the ABSOLUTE next patient to be seen,
-- considering ESI levels. If an ESI 1 arrives, they immediately jump to row 1.
CREATE OR REPLACE FUNCTION public.rpc_get_next_patient_by_triage(
    p_clinic_id uuid,
    p_session_id uuid,
    p_visit_type text DEFAULT 'ER'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_visit_id uuid;
BEGIN
    SELECT cv.id INTO v_next_visit_id
    FROM public.clinical_visits cv
    LEFT JOIN public.triage_records tr ON cv.id = tr.visit_id
    WHERE cv.session_id = p_session_id
      AND cv.clinic_id = p_clinic_id
      AND cv.status = 'WAITING'
      AND cv.visit_type = p_visit_type
    ORDER BY
        -- 1. Highest Acuity first (ESI 1 is most urgent, then 2, etc.)
        -- If no triage record exists yet, treat as ESI 5 (lowest)
        COALESCE(tr.triage_level, 5) ASC,
        
        -- 2. SLA breach proximity (those waiting longest within their tier)
        -- Formula: (Now - Arrival Time) / Max SLA Mins
        -- Higher ratio means they are closer to or past their SLA breach
        (EXTRACT(EPOCH FROM (now() - cv.arrival_at_department_time)) / 60) / NULLIF(COALESCE(tr.max_permissible_wait_mins, 240), 0) DESC,
        
        -- 3. Standard FIFO fallback for ties
        cv.arrival_at_department_time ASC
    LIMIT 1;

    RETURN v_next_visit_id;
END;
$$;


-- 4. Process Next Action (Triage Aware)
-- Upgraded from old 'NEXT' function to use the Acuity Reordering Engine
CREATE OR REPLACE FUNCTION public.rpc_process_triage_action(
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
BEGIN
    -- Strict Lock
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_clinic_id FOR UPDATE;

    IF p_action = 'NEXT_ER' THEN
        -- Mark current SERVING as SERVED (Finished triage/consult)
        SELECT id INTO v_current_serving_id 
        FROM public.clinical_visits 
        WHERE session_id = p_session_id AND status = 'SERVING' AND visit_type = 'ER' LIMIT 1;

        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.clinical_visits 
            SET previous_status = status, status = 'SERVED', consultant_assessment_start_time = now() 
            WHERE id = v_current_serving_id;
            
            INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
            VALUES (p_clinic_id, p_staff_id, 'CONSULT_START', 'clinical_visits', v_current_serving_id);
        END IF;

        -- Fetch strictly via Acuity Engine
        v_next_visit_id := public.rpc_get_next_patient_by_triage(p_clinic_id, p_session_id, 'ER');

        IF v_next_visit_id IS NULL THEN
             RETURN json_build_object('success', false, 'error', 'ER Queue is empty');
        END IF;

        -- Advance state
        UPDATE public.clinical_visits SET previous_status = status, status = 'SERVING' WHERE id = v_next_visit_id;
        
        INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
        VALUES (p_clinic_id, p_staff_id, 'CALLED_FROM_TRIAGE', 'clinical_visits', v_next_visit_id);

        RETURN json_build_object('success', true, 'called_visit_id', v_next_visit_id);
    END IF;
    
    RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;


-- 5. SLA Breach Escalation Engine
-- Run this via pg_cron every minute to detect actively breaching ER patients.
CREATE OR REPLACE FUNCTION public.cron_check_sla_breaches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_breach RECORD;
BEGIN
    FOR v_breach IN 
        SELECT 
            cv.id AS visit_id,
            cv.clinic_id,
            tr.triage_level,
            EXTRACT(EPOCH FROM (now() - cv.arrival_at_department_time))/60 AS current_wait_mins,
            tr.max_permissible_wait_mins
        FROM public.clinical_visits cv
        JOIN public.triage_records tr ON cv.id = tr.visit_id
        WHERE cv.status = 'WAITING' 
          AND cv.visit_type = 'ER'
          AND tr.escalated_at IS NULL -- Only escalate once
          AND EXTRACT(EPOCH FROM (now() - cv.arrival_at_department_time))/60 > tr.max_permissible_wait_mins
    LOOP
        -- Mark as escalated
        UPDATE public.triage_records SET escalated_at = now() WHERE visit_id = v_breach.visit_id;
        
        -- Insert Escalation Event (Used by Message Broker to trigger SMS/WhatsApp to ED Head)
        INSERT INTO public.security_audit_logs (
            clinic_id, action_type, table_name, record_id, metadata
        ) VALUES (
            v_breach.clinic_id, 'SLA_BREACH_ESCALATION', 'triage_records', v_breach.visit_id,
            jsonb_build_object(
                'triage_level', v_breach.triage_level, 
                'wait_mins', v_breach.current_wait_mins,
                'max_allowed', v_breach.max_permissible_wait_mins
            )
        );
    END LOOP;
END;
$$;
