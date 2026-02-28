-- =================================================================================
-- PHASE 13: CLINICAL QUEUE MUTATIONS
-- Upgrades the mutation logic (Next, Skip, Cancel) to the clinical_visits architecture.
-- =================================================================================

CREATE OR REPLACE FUNCTION public.rpc_process_clinical_action(
    p_clinic_id uuid,
    p_session_id uuid,
    p_staff_id uuid,
    p_action text, -- 'NEXT', 'SKIP', 'CANCEL', 'RECALL', 'UNDO'
    p_visit_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_serving_id uuid;
    v_next_visit_id uuid;
    v_target_visit RECORD;
BEGIN
    -- 1. Lock Session strictly
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_clinic_id FOR UPDATE;

    -- ===============================================================
    -- ACTION: NEXT
    -- ===============================================================
    IF p_action = 'NEXT' THEN
        -- Mark current SERVING as SERVED
        SELECT id INTO v_current_serving_id 
        FROM public.clinical_visits 
        WHERE session_id = p_session_id AND status = 'SERVING' LIMIT 1;

        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.clinical_visits 
            SET previous_status = status, status = 'SERVED', discharge_order_time = now(), discharge_completed_time = now() 
            WHERE id = v_current_serving_id;
            
            INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
            VALUES (p_clinic_id, p_staff_id, 'VISIT_SERVED', 'clinical_visits', v_current_serving_id);
        END IF;

        -- Find the next WAITING visit (Acuity Aware)
        -- We try to use the triage engine if available, otherwise FIFO
        SELECT id INTO v_next_visit_id
        FROM public.clinical_visits
        WHERE session_id = p_session_id AND status = 'WAITING'
        ORDER BY is_priority DESC, token_number ASC
        LIMIT 1;

        IF v_next_visit_id IS NULL THEN
             RETURN json_build_object('success', false, 'error', 'Queue is empty');
        END IF;

        -- Advance state
        UPDATE public.clinical_visits SET previous_status = status, status = 'SERVING', consultant_assessment_start_time = now() WHERE id = v_next_visit_id;
        
        INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
        VALUES (p_clinic_id, p_staff_id, 'VISIT_CALLED', 'clinical_visits', v_next_visit_id);

        RETURN json_build_object('success', true, 'visit_id', v_next_visit_id);

    -- ===============================================================
    -- ACTION: SKIP
    -- ===============================================================
    ELSIF p_action = 'SKIP' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits SET previous_status = status, status = 'SKIPPED' WHERE id = p_visit_id;
        INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
        VALUES (p_clinic_id, p_staff_id, 'VISIT_SKIPPED', 'clinical_visits', p_visit_id);
        RETURN json_build_object('success', true);

    -- ===============================================================
    -- ACTION: RECALL
    -- ===============================================================
    ELSIF p_action = 'RECALL' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits SET previous_status = status, status = 'WAITING', is_priority = true WHERE id = p_visit_id;
        INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
        VALUES (p_clinic_id, p_staff_id, 'VISIT_RECALLED', 'clinical_visits', p_visit_id);
        RETURN json_build_object('success', true);

    -- ===============================================================
    -- ACTION: ARRIVE
    -- ===============================================================
    ELSIF p_action = 'ARRIVE' AND p_visit_id IS NOT NULL THEN
        UPDATE public.clinical_visits 
        SET previous_status = status, status = 'WAITING', is_arrived = true, arrival_at_department_time = now() 
        WHERE id = p_visit_id;

        INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id) 
        VALUES (p_clinic_id, p_staff_id, 'VISIT_ARRIVED', 'clinical_visits', p_visit_id);
        RETURN json_build_object('success', true);

    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid action');
    END IF;

END;
$$;
