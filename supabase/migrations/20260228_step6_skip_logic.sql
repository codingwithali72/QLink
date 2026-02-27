-- Support for Step 6: Skip Scenario
-- Updates the WA alert trigger to handle SKIPPED and CANCELLED events by notifying the next few patients.

CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_alerts_v2()
RETURNS trigger AS $$
DECLARE
    v_patient RECORD;
    v_waiters RECORD;
BEGIN
    -- A. CASE: Visit becomes SERVING (Standard Logic)
    IF NEW.status = 'SERVING' AND OLD.status != 'SERVING' THEN
        
        -- 1. Now Serving Alert for the person called
        SELECT phone, phone_encrypted INTO v_patient
        FROM public.patients WHERE id = NEW.patient_id;

        IF (v_patient.phone IS NOT NULL OR v_patient.phone_encrypted IS NOT NULL) THEN
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, NEW.id, v_patient.phone, v_patient.phone_encrypted, 'SERVING');
        END IF;

        -- 2. Near Turn Alert for the person exactly 5 spots away
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

        -- 3. "You are Next" Alert for the person exactly 1 spot away
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

    -- B. CASE: Visit is SKIPPED or CANCELLED (Step 6: Skip Scenario)
    -- If a token is skipped/cancelled, the people behind it move up.
    -- We notify the next 3 WAITING patients specifically about the "Queue Update".
    IF (NEW.status = 'SKIPPED' OR NEW.status = 'CANCELLED') AND (OLD.status = 'WAITING' OR OLD.status = 'SERVING') THEN
        FOR v_waiters IN 
            SELECT cv.id, p.phone, p.phone_encrypted 
            FROM public.clinical_visits cv
            JOIN public.patients p ON cv.patient_id = p.id
            WHERE cv.session_id = NEW.session_id 
              AND cv.status = 'WAITING' 
              AND cv.token_number > NEW.token_number
            ORDER BY cv.token_number ASC
            LIMIT 3
        LOOP
            INSERT INTO public.whatsapp_alerts_queue 
                (business_id, session_id, token_id, phone_number, phone_encrypted, event_type)
            VALUES 
                (NEW.clinic_id, NEW.session_id, v_waiters.id, v_waiters.phone, v_waiters.phone_encrypted, 'QUEUE_UPDATE');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
