-- WhatsApp Intake Layer Migration

-- 1. Create conversations table for 24-hour window eligibility
CREATE TABLE "public"."conversations" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "phone_number" text NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT now(),
    "conversation_open" boolean DEFAULT true,
    "wa_conversation_id" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_conversations_lookup ON "public"."conversations" ("business_id", "phone_number");

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conversations for their assigned business" 
ON "public"."conversations" FOR SELECT 
USING (
    auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = conversations.business_id)
);

CREATE POLICY "Staff can manage conversations for their assigned business" 
ON "public"."conversations" FOR ALL 
USING (
    auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = conversations.business_id)
);

-- 2. Extend existing message_logs table
ALTER TABLE "public"."message_logs"
    ADD COLUMN IF NOT EXISTS "phone_number" text,
    ADD COLUMN IF NOT EXISTS "wa_message_id" text,
    ADD COLUMN IF NOT EXISTS "delivery_status" text DEFAULT 'sent';

-- 3. Ensure Strict Idempotency 
CREATE UNIQUE INDEX IF NOT EXISTS "idx_whatsapp_token_idempotency" 
ON "public"."tokens" ("business_id", "patient_phone", "session_id") 
WHERE status IN ('WAITING', 'SERVING');

-- 4. Alert Engine Queue Table
CREATE TABLE "public"."whatsapp_alerts_queue" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "session_id" uuid NOT NULL,
    "token_id" uuid,
    "phone_number" text NOT NULL,
    "event_type" text NOT NULL, -- 'NEAR_TURN', 'SERVING', 'DELAYED'
    "status" text DEFAULT 'PENDING',
    "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."whatsapp_alerts_queue" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view alerts for assigned business" 
ON "public"."whatsapp_alerts_queue" FOR SELECT 
USING (
    auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = whatsapp_alerts_queue.business_id)
);

-- 5. Alert Engine Triggers (Server-Side Logic)
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_alerts()
RETURNS trigger AS $$
DECLARE
    v_waiters RECORD;
BEGIN
    -- Only trigger on status change to SERVING
    IF NEW.status = 'SERVING' AND OLD.status != 'SERVING' THEN
        -- A. Now Serving Alert for the person called
        IF NEW.patient_phone IS NOT NULL AND TRIM(NEW.patient_phone) != '' THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, NEW.id, NEW.patient_phone, 'SERVING');
        END IF;

        -- B. Near Turn Alert for the person exactly 5 spots away
        -- If token_number 10 is called, tokens_left <= 5 means token wait queue position. 
        -- In an absolute sequential queue without skips, token_number 15 is 5 away.
        FOR v_waiters IN 
            SELECT id, patient_phone FROM public.tokens 
            WHERE session_id = NEW.session_id 
              AND status = 'WAITING' 
              AND token_number = NEW.token_number + 5 
              AND patient_phone IS NOT NULL
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, v_waiters.id, v_waiters.patient_phone, 'NEAR_TURN');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_alerts_on_token_served
AFTER UPDATE OF status ON public.tokens
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wa_alerts();

-- 6. Delay Broadcast Trigger
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_delay_alert()
RETURNS trigger AS $$
DECLARE
    v_waiters RECORD;
BEGIN
    IF NEW.status = 'PAUSED' AND OLD.status != 'PAUSED' THEN
        -- Broadcast "Doctor delayed by 15 mins" to all WAITING
        FOR v_waiters IN 
            SELECT id, patient_phone FROM public.tokens 
            WHERE session_id = NEW.id 
              AND status = 'WAITING' 
              AND patient_phone IS NOT NULL
        LOOP
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.id, v_waiters.id, v_waiters.patient_phone, 'DELAYED');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_alerts_on_session_paused
AFTER UPDATE OF status ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wa_delay_alert();
