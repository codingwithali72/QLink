-- =================================================================================
-- PHASE 16: WHATSAPP CLINICAL MIGRATION
-- Adapts WhatsApp interactive tables and feedback to clinical architecture.
-- =================================================================================

-- 1. Update whatsapp_conversations to link to clinical_visits
ALTER TABLE "public"."whatsapp_conversations" 
DROP CONSTRAINT IF EXISTS "whatsapp_conversations_active_token_id_fkey",
ADD COLUMN IF NOT EXISTS "active_visit_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE SET NULL;

-- 2. Migrate token_feedback to clinical_feedback (or just reuse table with FK update)
ALTER TABLE "public"."token_feedback" 
DROP CONSTRAINT IF EXISTS "token_feedback_token_id_fkey";

-- We won't rename the table to keep it compatible with existing code for now,
-- but we will ensure it can reference either or both during transition.
-- Actually, it is better to have a proper FK to clinical_visits.
ALTER TABLE "public"."token_feedback"
ADD COLUMN IF NOT EXISTS "visit_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE;

-- 3. Update whatsapp_alerts_queue
ALTER TABLE "public"."whatsapp_alerts_queue"
DROP CONSTRAINT IF EXISTS "whatsapp_alerts_queue_token_id_fkey",
ADD COLUMN IF NOT EXISTS "visit_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE;

-- 4. Update Trigger for feedback on clinical_visits
CREATE OR REPLACE FUNCTION public.trg_visit_enqueue_wa_feedback()
RETURNS trigger AS $$
DECLARE
    v_phone text;
BEGIN
    IF NEW.status = 'SERVED' AND (OLD.status IS NULL OR OLD.status != 'SERVED') THEN
        -- Get patient phone
        SELECT COALESCE(phone, '') INTO v_phone FROM public.patients WHERE id = NEW.patient_id;
        
        IF v_phone != '' THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, NEW.id, v_phone, 'FEEDBACK_REQUEST');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_visit_served_feedback
AFTER UPDATE OF status ON public.clinical_visits
FOR EACH ROW EXECUTE FUNCTION public.trg_visit_enqueue_wa_feedback();

-- 5. Update Serving Trigger for clinical_visits
CREATE OR REPLACE FUNCTION public.trg_visit_enqueue_wa_alerts()
RETURNS trigger AS $$
DECLARE
    v_phone text;
BEGIN
    -- Only trigger on status change to SERVING
    IF NEW.status = 'SERVING' AND (OLD.status IS NULL OR OLD.status != 'SERVING') THEN
        SELECT COALESCE(phone, '') INTO v_phone FROM public.patients WHERE id = NEW.patient_id;

        IF v_phone != '' THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, visit_id, phone_number, event_type)
            VALUES (NEW.clinic_id, NEW.session_id, NEW.id, v_phone, 'NOW_SERVING');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_visit_serving_alert
AFTER UPDATE OF status ON public.clinical_visits
FOR EACH ROW EXECUTE FUNCTION public.trg_visit_enqueue_wa_alerts();
