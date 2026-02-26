-- WhatsApp Interactive Upgrade Migration

-- 1. Create table for conversation state tracking
CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "phone" text NOT NULL,
    "state" text NOT NULL DEFAULT 'IDLE',
    "last_interaction" timestamp with time zone DEFAULT now(),
    "active_token_id" uuid REFERENCES "public"."tokens"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

-- Ensure only one active conversation state per clinic and phone
CREATE UNIQUE INDEX IF NOT EXISTS "idx_whatsapp_conv_unique" ON "public"."whatsapp_conversations" ("clinic_id", "phone");

ALTER TABLE "public"."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wa_conv for their assigned business" 
ON "public"."whatsapp_conversations" FOR SELECT 
USING (
    auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = whatsapp_conversations.clinic_id)
);

CREATE POLICY "Staff can manage wa_conv for their assigned business" 
ON "public"."whatsapp_conversations" FOR ALL 
USING (
    auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = whatsapp_conversations.clinic_id)
);

-- 2. Create table for detailed message logging and idempotency
CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" text PRIMARY KEY, -- WhatsApp Message ID from webhook
    "clinic_id" uuid REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "phone" text NOT NULL,
    "direction" text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    "message_type" text NOT NULL, -- e.g., 'text', 'interactive', 'template'
    "template_name" text,
    "status" text DEFAULT 'received', -- 'received', 'sent', 'delivered', 'read', 'failed'
    "timestamp" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_wa_msg_phone" ON "public"."whatsapp_messages" ("phone");

ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wa_messages for their assigned business" 
ON "public"."whatsapp_messages" FOR SELECT 
USING (
    clinic_id IS NULL OR auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = whatsapp_messages.clinic_id)
);

CREATE POLICY "Staff can manage wa_messages for their assigned business" 
ON "public"."whatsapp_messages" FOR ALL 
USING (
    clinic_id IS NULL OR auth.uid() IN (SELECT id FROM public.staff_users WHERE business_id = whatsapp_messages.clinic_id)
);

-- 3. Create table for token post-service feedback
CREATE TABLE IF NOT EXISTS "public"."token_feedback" (
    "token_id" uuid PRIMARY KEY REFERENCES "public"."tokens"("id") ON DELETE CASCADE,
    "rating" integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    "feedback_text" text,
    "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."token_feedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view feedback for their assigned business" 
ON "public"."token_feedback" FOR SELECT 
USING (
    auth.uid() IN (
        SELECT su.id 
        FROM public.staff_users su 
        JOIN public.tokens t ON t.business_id = su.business_id 
        WHERE t.id = token_feedback.token_id
    )
);

CREATE POLICY "Staff can manage feedback for their assigned business" 
ON "public"."token_feedback" FOR ALL 
USING (
    auth.uid() IN (
        SELECT su.id 
        FROM public.staff_users su 
        JOIN public.tokens t ON t.business_id = su.business_id 
        WHERE t.id = token_feedback.token_id
    )
);

-- 4. Update Trigger for feedback request on SERVED
CREATE OR REPLACE FUNCTION public.trg_enqueue_wa_feedback()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'SERVED' AND OLD.status != 'SERVED' THEN
        IF NEW.patient_phone IS NOT NULL AND TRIM(NEW.patient_phone) != '' THEN
            INSERT INTO public.whatsapp_alerts_queue (business_id, session_id, token_id, phone_number, event_type)
            VALUES (NEW.business_id, NEW.session_id, NEW.id, NEW.patient_phone, 'FEEDBACK_REQUEST');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_alerts_on_token_served_feedback
AFTER UPDATE OF status ON public.tokens
FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wa_feedback();
