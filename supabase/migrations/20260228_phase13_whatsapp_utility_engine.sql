-- =================================================================================
-- PHASE 13: WHATSAPP UTILITY TEMPLATE DISPATCH ENGINE
-- Creates structured logging and exponential backoff retry mechanisms.
-- =================================================================================

-- 1. WhatsApp Dispatch Logs
CREATE TABLE IF NOT EXISTS "public"."whatsapp_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "token_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE SET NULL,
    "phone" text NOT NULL,
    "template_name" text NOT NULL,
    "payload" jsonb NOT NULL,
    "meta_message_id" text,
    "status" text NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'delivered', 'read', 'failed'
    "error_message" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Index for searching message status via Webhook Delivery Receipts
CREATE INDEX IF NOT EXISTS "idx_whatsapp_logs_meta_msg_id" ON "public"."whatsapp_logs"("meta_message_id");

-- 2. Retry Queue (Fail-safe for network 500s)
CREATE TABLE IF NOT EXISTS "public"."whatsapp_retry_queue" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "log_id" uuid NOT NULL REFERENCES "public"."whatsapp_logs"("id") ON DELETE CASCADE,
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "retry_count" integer NOT NULL DEFAULT 0,
    "next_retry_at" timestamp with time zone NOT NULL DEFAULT now(),
    "last_error" text,
    "status" text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'abandoned'
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Index for polling the queue efficiently
CREATE INDEX IF NOT EXISTS "idx_whatsapp_retry_next_at" ON "public"."whatsapp_retry_queue"("status", "next_retry_at");

-- 3. Row Level Security
ALTER TABLE "public"."whatsapp_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_retry_queue" ENABLE ROW LEVEL SECURITY;

-- 3A. RLS: whatsapp_logs (Strict Tenant Isolation)
CREATE POLICY "Staff can view wa_logs for their assigned business" 
ON "public"."whatsapp_logs"
FOR SELECT USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

CREATE POLICY "Staff can manage wa_logs for their assigned business" 
ON "public"."whatsapp_logs"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

-- 3B. RLS: whatsapp_retry_queue (System Only typically, but allow staff access just in case)
CREATE POLICY "Staff can view wa_retry for their assigned business" 
ON "public"."whatsapp_retry_queue"
FOR SELECT USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

CREATE POLICY "Staff can manage wa_retry for their assigned business" 
ON "public"."whatsapp_retry_queue"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);
