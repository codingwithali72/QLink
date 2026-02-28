-- =================================================================================
-- PHASE 14: ENHANCED CLINICAL WHATSAPP TRIGGERS
-- Adds NEAR_TURN, NEXT_IN_LINE, and ARRIVAL_PROMPT to clinical_visits orchestration.
-- =================================================================================

CREATE OR REPLACE FUNCTION public.trg_visit_enqueue_wa_alerts()
RETURNS trigger AS $$
DECLARE
    v_phone text;
    v_waiter RECORD;
BEGIN
    -- Only trigger on status change to SERVING
    IF NEW.status = 'SERVING' AND (OLD.status IS NULL OR OLD.status != 'SERVING') THEN
        
        -- 1. NOW_SERVING alert for the patient being called
        SELECT COALESCE(phone, '') INTO v_phone FROM public.patients WHERE id = NEW.patient_id;
        IF v_phone != '' THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, NEW.id, v_phone, 'SERVING');
        END IF;

        -- 2. NEAR_TURN alert for the person exactly 5 spots away
        FOR v_waiter IN 
            SELECT v.id, p.phone 
            FROM public.clinical_visits v
            JOIN public.patients p ON v.patient_id = p.id
            WHERE v.session_id = NEW.session_id 
              AND v.status = 'WAITING' 
              AND v.token_number = NEW.token_number + 5 
              AND p.phone IS NOT NULL
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, v_waiter.id, v_waiter.phone, 'NEAR_TURN');
        END LOOP;

        -- 3. ARRIVAL_PROMPT (Phase 14) for the person 3 spots away
        FOR v_waiter IN 
            SELECT v.id, p.phone, v.registration_complete_time
            FROM public.clinical_visits v
            JOIN public.patients p ON v.patient_id = p.id
            WHERE v.session_id = NEW.session_id 
              AND v.status = 'WAITING' 
              AND v.token_number = NEW.token_number + 3 
              AND p.phone IS NOT NULL
              AND v.registration_complete_time IS NULL -- Only if they haven't checked in!
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, v_waiter.id, v_waiter.phone, 'ARRIVAL_PROMPT');
        END LOOP;

        -- 4. NEXT_IN_LINE alert for the person exactly 1 spot away
        FOR v_waiter IN 
            SELECT v.id, p.phone 
            FROM public.clinical_visits v
            JOIN public.patients p ON v.patient_id = p.id
            WHERE v.session_id = NEW.session_id 
              AND v.status = 'WAITING' 
              AND v.token_number = NEW.token_number + 1 
              AND p.phone IS NOT NULL
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, v_waiter.id, v_waiter.phone, 'NEXT_IN_LINE');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
