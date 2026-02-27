-- =================================================================================
-- PHASE 11: WHATSAPP TRIGGER RE-WIRING (Bridge Migration)
-- Updates WhatsApp Alerts Queue to listen to the new `clinical_visits` table
-- and safely extract the encrypted phone numbers from the `patients` table.
-- =================================================================================

-- 1. Make phone_number nullable in whatsapp_alerts_queue (since it handles encrypted records)
ALTER TABLE "public"."whatsapp_alerts_queue" ALTER COLUMN "phone_number" DROP NOT NULL;

-- 2. Add an explicit column for encrypted phone to track DPDP compliance cleanly
ALTER TABLE "public"."whatsapp_alerts_queue" ADD COLUMN IF NOT EXISTS "phone_encrypted" text;

-- 3. The Core Alert Trigger (SERVING, NEXT_IN_LINE, NEAR_TURN)
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_alerts_v2()
RETURNS trigger AS $$
DECLARE
    v_patient RECORD;
    v_waiters RECORD;
BEGIN
    -- Only trigger on status change to 'SERVING'
    IF NEW.status = 'SERVING' AND OLD.status != 'SERVING' THEN
        
        -- A. Fetch the current patient's phone details from the secured `patients` table
        SELECT phone, phone_encrypted INTO v_patient
        FROM public.patients WHERE id = NEW.patient_id;

        -- B. Now Serving Alert for the person called
        IF (v_patient.phone IS NOT NULL OR v_patient.phone_encrypted IS NOT NULL) THEN
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, NEW.id, v_patient.phone, v_patient.phone_encrypted, 'SERVING');
        END IF;

        -- C. Near Turn Alert for the person exactly 5 spots away
        FOR v_waiters IN 
            SELECT cv.id, p.phone, p.phone_encrypted 
            FROM public.clinical_visits cv
            JOIN public.patients p ON cv.patient_id = p.id
            WHERE cv.session_id = NEW.session_id 
              AND cv.status = 'WAITING' 
              AND cv.token_number = NEW.token_number + 5 
              AND (p.phone IS NOT NULL OR p.phone_encrypted IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, v_waiters.id, v_waiters.phone, v_waiters.phone_encrypted, 'NEAR_TURN');
        END LOOP;

        -- D. "You are Next" Alert for the person exactly 1 spot away
        FOR v_waiters IN 
            SELECT cv.id, p.phone, p.phone_encrypted 
            FROM public.clinical_visits cv
            JOIN public.patients p ON cv.patient_id = p.id
            WHERE cv.session_id = NEW.session_id 
              AND cv.status = 'WAITING' 
              AND cv.token_number = NEW.token_number + 1 
              AND (p.phone IS NOT NULL OR p.phone_encrypted IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, v_waiters.id, v_waiters.phone, v_waiters.phone_encrypted, 'NEXT_IN_LINE');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Delay Trigger Update (PAUSED/DELAYED)
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_delay_alert_v2()
RETURNS trigger AS $$
DECLARE
    v_waiters RECORD;
BEGIN
    IF NEW.status = 'PAUSED' AND OLD.status != 'PAUSED' THEN
        -- Broadcast "Doctor delayed" to all WAITING
        FOR v_waiters IN 
            SELECT cv.id, p.phone, p.phone_encrypted 
            FROM public.clinical_visits cv
            JOIN public.patients p ON cv.patient_id = p.id
            WHERE cv.session_id = NEW.id 
              AND cv.status = 'WAITING' 
              AND (p.phone IS NOT NULL OR p.phone_encrypted IS NOT NULL)
        LOOP
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.id, v_waiters.id, v_waiters.phone, v_waiters.phone_encrypted, 'DELAYED');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Feedback Request Update (SERVED)
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_feedback_v2()
RETURNS trigger AS $$
DECLARE
    v_patient RECORD;
BEGIN
    IF NEW.status = 'SERVED' AND OLD.status != 'SERVED' THEN
        SELECT phone, phone_encrypted INTO v_patient
        FROM public.patients WHERE id = NEW.patient_id;

        IF (v_patient.phone IS NOT NULL OR v_patient.phone_encrypted IS NOT NULL) THEN
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, NEW.id, v_patient.phone, v_patient.phone_encrypted, 'FEEDBACK_REQUEST');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Attach to the NEW 'clinical_visits' table
DROP TRIGGER IF EXISTS trg_wa_alerts_on_visit ON "public"."clinical_visits";
CREATE TRIGGER trg_wa_alerts_on_visit
AFTER UPDATE OF "status" ON "public"."clinical_visits"
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wa_alerts_v2();

DROP TRIGGER IF EXISTS trg_wa_delay_on_session ON "public"."sessions";
CREATE TRIGGER trg_wa_delay_on_session
AFTER UPDATE OF "status" ON "public"."sessions"
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wa_delay_alert_v2();

DROP TRIGGER IF EXISTS trg_wa_feedback_on_visit ON "public"."clinical_visits";
CREATE TRIGGER trg_wa_feedback_on_visit
AFTER UPDATE OF "status" ON "public"."clinical_visits"
FOR EACH ROW
WHEN (NEW.status = 'SERVED' AND OLD.status != 'SERVED')
EXECUTE FUNCTION public.trg_enqueue_wa_feedback_v2();
