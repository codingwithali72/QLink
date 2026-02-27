-- Migration to fix WhatsApp triggers for DPDP compliance (encrypted tokens)
-- Also updates whatsapp_alerts_queue to include 'NEXT_IN_LINE' event
-- And makes phone_number nullable in the alerts queue.

-- 1. Make phone_number nullable in whatsapp_alerts_queue
ALTER TABLE "public"."whatsapp_alerts_queue" ALTER COLUMN "phone_number" DROP NOT NULL;

-- 2. Update trg_enqueue_wa_alerts to handle encrypted patients and 'NEXT_IN_LINE'
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_alerts()
RETURNS trigger AS $$
DECLARE
    v_waiters RECORD;
BEGIN
    -- Only trigger on status change to SERVING
    IF NEW.status = 'SERVING' AND OLD.status != 'SERVING' THEN
        -- A. Now Serving Alert for the person called
        IF (NEW.patient_phone IS NOT NULL AND TRIM(NEW.patient_phone) != '') OR (NEW.patient_phone_hash IS NOT NULL) THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, NEW.id, NEW.patient_phone, 'SERVING');
        END IF;

        -- B. Near Turn Alert for the person exactly 5 spots away
        FOR v_waiters IN 
            SELECT id, patient_phone FROM public.tokens 
            WHERE session_id = NEW.session_id 
              AND status = 'WAITING' 
              AND token_number = NEW.token_number + 5 
              AND (patient_phone IS NOT NULL OR patient_phone_hash IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, v_waiters.id, v_waiters.patient_phone, 'NEAR_TURN');
        END LOOP;

        -- C. "You are Next" Alert for the person exactly 1 spot away
        FOR v_waiters IN 
            SELECT id, patient_phone FROM public.tokens 
            WHERE session_id = NEW.session_id 
              AND status = 'WAITING' 
              AND token_number = NEW.token_number + 1 
              AND (patient_phone IS NOT NULL OR patient_phone_hash IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, v_waiters.id, v_waiters.patient_phone, 'NEXT_IN_LINE');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update trg_enqueue_wa_delay_alert to handle encrypted patients
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_delay_alert()
RETURNS trigger AS $$
DECLARE
    v_waiters RECORD;
BEGIN
    IF NEW.status = 'PAUSED' AND OLD.status != 'PAUSED' THEN
        -- Broadcast "Doctor delayed" to all WAITING
        FOR v_waiters IN 
            SELECT id, patient_phone FROM public.tokens 
            WHERE session_id = NEW.id 
              AND status = 'WAITING' 
              AND (patient_phone IS NOT NULL OR patient_phone_hash IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.id, v_waiters.id, v_waiters.patient_phone, 'DELAYED');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update trg_enqueue_wa_feedback to handle encrypted patients
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_feedback()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'SERVED' AND OLD.status != 'SERVED' THEN
        IF (NEW.patient_phone IS NOT NULL AND TRIM(NEW.patient_phone) != '') OR (NEW.patient_phone_hash IS NOT NULL) THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, NEW.id, NEW.patient_phone, 'FEEDBACK_REQUEST');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
