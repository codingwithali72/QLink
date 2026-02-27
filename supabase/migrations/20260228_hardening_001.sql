-- =================================================================================
-- QLINK HARDENING 001: DPDP COMPLIANCE & BILLING INFRASTRUCTURE
-- =================================================================================

-- 1. PII DATA DECAY (PHASE 7 - DPDP Compliance)
-- Automatically NULLifies patient PII after 30 days to meet Indian DPDP Act requirements.
CREATE OR REPLACE FUNCTION public.fn_purge_expired_pii()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.patients
    SET 
        phone = NULL,
        phone_encrypted = NULL,
        phone_hash = NULL,
        abha_address = NULL
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND (phone IS NOT NULL OR phone_encrypted IS NOT NULL);
    
    -- Log the purge event for audit trails
    INSERT INTO public.system_audit_logs (action_type, entity_type, metadata)
    VALUES ('PII_PURGE', 'patients', jsonb_build_object('count', (SELECT count(*) FROM public.patients WHERE created_at < NOW() - INTERVAL '30 days')));
END;
$$;

-- Note: In a production Supabase environment, you would enable pg_cron and schedule:
-- SELECT cron.schedule('0 0 * * *', 'SELECT public.fn_purge_expired_pii();');

-- 2. BILLING INFRASTRUCTURE (PHASE 8 - SaaS Readiness)

-- PLAN TIERS
CREATE TABLE "public"."plan_tiers" (
    "id" text PRIMARY KEY, -- 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'
    "name" text NOT NULL,
    "monthly_price_inr" integer NOT NULL,
    "max_whatsapp_messages" integer NOT NULL,
    "max_monthly_tokens" integer NOT NULL,
    "features" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone DEFAULT now()
);

INSERT INTO "public"."plan_tiers" (id, name, monthly_price_inr, max_whatsapp_messages, max_monthly_tokens)
VALUES 
('STARTER', 'Starter Clinic', 1999, 1000, 3000),
('PROFESSIONAL', 'Professional Hospital', 4999, 5000, 15000)
ON CONFLICT (id) DO NOTHING;

-- CLINIC SUBSCRIPTIONS
CREATE TABLE "public"."clinic_subscriptions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "plan_id" text NOT NULL REFERENCES "public"."plan_tiers"("id"),
    "status" text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, PAST_DUE
    "current_period_start" timestamp with time zone DEFAULT now(),
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("clinic_id")
);

-- USAGE TRACKING
CREATE TABLE "public"."usage_tracking" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "month_year" text NOT NULL, -- "YYYY-MM"
    "whatsapp_count" integer NOT NULL DEFAULT 0,
    "token_count" integer NOT NULL DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("clinic_id", "month_year")
);

-- FUNCTION: Update Usage
CREATE OR REPLACE FUNCTION public.fn_increment_usage(p_clinic_id uuid, p_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_month text := to_char(now(), 'YYYY-MM');
BEGIN
    INSERT INTO public.usage_tracking (clinic_id, month_year, whatsapp_count, token_count)
    VALUES (p_clinic_id, v_month, 0, 0)
    ON CONFLICT (clinic_id, month_year) 
    DO UPDATE SET 
        whatsapp_count = CASE WHEN p_type = 'WHATSAPP' THEN usage_tracking.whatsapp_count + 1 ELSE usage_tracking.whatsapp_count END,
        token_count = CASE WHEN p_type = 'TOKEN' THEN usage_tracking.token_count + 1 ELSE usage_tracking.token_count END,
        updated_at = now();
END;
$$;
