-- =================================================================================
-- QLINK RE-ARCHITECTURE PHASE 5: BILLING, GST & SUBSCRIPTION ENFORCEMENT
-- Implements sibtain.md Phase 9 (Lines 143-510):
-- "Message usage metering, Token/day cap enforcement, Multi-branch pricing,
--  GST logic, Subscription suspension logic"
-- =================================================================================

-- 1. Extend plans table with GST and usage caps
ALTER TABLE "public"."plans"
    ADD COLUMN IF NOT EXISTS "gst_rate_pct" numeric(5,2) DEFAULT 18.00, -- 18% GST for SaaS in India
    ADD COLUMN IF NOT EXISTS "max_tokens_per_day" integer,              -- NULL = unlimited
    ADD COLUMN IF NOT EXISTS "max_branches" integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "max_doctors" integer DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "whatsapp_msgs_per_month" integer,         -- NULL = unlimited  
    ADD COLUMN IF NOT EXISTS "support_tier" text DEFAULT 'EMAIL',       -- 'EMAIL','CHAT','PHONE','DEDICATED'
    ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;

-- Rename price_inr to price_monthly if not already renamed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='price_inr') THEN
        ALTER TABLE "public"."plans" RENAME COLUMN "price_inr" TO "price_monthly";
    END IF;
END $$;

-- 2. Subscriptions table (tenant → plan assignment)
CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    "clinic_id" uuid REFERENCES "public"."businesses"("id") ON DELETE CASCADE,  -- For single-clinic tenants
    "plan_id" uuid NOT NULL REFERENCES "public"."plans"("id"),
    "status" text NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE','SUSPENDED','CANCELLED','TRIAL'
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone DEFAULT date_trunc('month', now()),
    "current_period_end" timestamp with time zone DEFAULT date_trunc('month', now() + INTERVAL '1 month'),
    "monthly_amount_inr" numeric(10,2) NOT NULL,
    "gst_amount_inr" numeric(10,2),
    "suspension_reason" text,
    "suspended_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_subscriptions_clinic" ON "public"."subscriptions" ("clinic_id", "status");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status" ON "public"."subscriptions" ("status", "current_period_end");

-- 3. Invoices table
CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" uuid NOT NULL REFERENCES "public"."subscriptions"("id"),
    "clinic_id" uuid NOT NULL,
    "invoice_number" text NOT NULL UNIQUE, -- e.g. "QLINK-2026-001234"
    "period_start" date NOT NULL,
    "period_end" date NOT NULL,
    "amount_inr" numeric(10,2) NOT NULL,
    "gst_inr" numeric(10,2) NOT NULL,
    "total_inr" numeric(10,2) NOT NULL,
    "status" text NOT NULL DEFAULT 'PENDING', -- 'PENDING','PAID','OVERDUE','VOID'
    "tokens_used" integer DEFAULT 0,
    "whatsapp_msgs_used" integer DEFAULT 0,
    "due_date" date,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- 4. Auto-generate sequential invoice numbers
CREATE SEQUENCE IF NOT EXISTS "public"."invoice_seq" START 1000;

CREATE OR REPLACE FUNCTION public.fn_create_invoice(
    p_subscription_id uuid,
    p_period_start date,
    p_period_end date
) RETURNS uuid AS $$
DECLARE
    v_sub record;
    v_plan record;
    v_invoice_id uuid;
    v_invoice_num text;
    v_seq integer;
    v_tokens_used integer;
    v_wa_used integer;
    v_amount numeric;
    v_gst numeric;
BEGIN
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
    SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;

    v_seq := nextval('public.invoice_seq');
    v_invoice_num := 'QLINK-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

    -- Aggregate usage for the billing period
    SELECT COUNT(*) INTO v_tokens_used
    FROM public.clinical_visits
    WHERE clinic_id = v_sub.clinic_id
      AND DATE(created_at) BETWEEN p_period_start AND p_period_end;

    SELECT COUNT(*) INTO v_wa_used
    FROM public.whatsapp_logs
    WHERE clinic_id = v_sub.clinic_id
      AND DATE(created_at) BETWEEN p_period_start AND p_period_end;

    v_amount := v_sub.monthly_amount_inr;
    v_gst := ROUND(v_amount * (v_plan.gst_rate_pct / 100.0), 2);

    INSERT INTO public.invoices (subscription_id, clinic_id, invoice_number, period_start, period_end,
        amount_inr, gst_inr, total_inr, status, tokens_used, whatsapp_msgs_used, due_date)
    VALUES (p_subscription_id, v_sub.clinic_id, v_invoice_num, p_period_start, p_period_end,
        v_amount, v_gst, v_amount + v_gst, 'PENDING', v_tokens_used, v_wa_used,
        (p_period_end + INTERVAL '7 days')::date)
    RETURNING id INTO v_invoice_id;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Token/day cap enforcement via database check
-- This RPC is called before createToken in the server action
CREATE OR REPLACE FUNCTION public.rpc_check_usage_cap(p_clinic_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_plan record;
    v_today_count integer;
BEGIN
    -- Get active subscription
    SELECT s.*, p.max_tokens_per_day INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.clinic_id = p_clinic_id AND s.status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'No subscription found - defaulting to allow');
    END IF;

    -- Check if subscription is suspended
    IF v_sub.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Subscription suspended: ' || COALESCE(v_sub.suspension_reason, 'Payment overdue'));
    END IF;

    -- Check daily token cap
    IF v_sub.max_tokens_per_day IS NOT NULL THEN
        SELECT COUNT(*) INTO v_today_count
        FROM public.clinical_visits
        WHERE clinic_id = p_clinic_id AND DATE(created_at) = CURRENT_DATE;

        IF v_today_count >= v_sub.max_tokens_per_day THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason', 'Daily token limit reached (' || v_sub.max_tokens_per_day || '). Upgrade your plan.',
                'current', v_today_count,
                'limit', v_sub.max_tokens_per_day
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'current', COALESCE(v_today_count, 0));
END;
$$ LANGUAGE plpgsql;


-- 6. Seed updated plan tiers with caps
-- Since 'name' is unique, we use ON CONFLICT to update caps for existing plans
INSERT INTO public.plans (name, price_monthly, max_tokens_per_day, max_branches, max_doctors, whatsapp_msgs_per_month, support_tier, gst_rate_pct)
VALUES
    ('Starter', 999,   100,  1,  3,  500,    'EMAIL',      18.00),
    ('Growth',  2999,  500,  3,  15, 3000,   'CHAT',       18.00),
    ('Hospital',7999,  NULL, 10, 50, NULL,   'DEDICATED',  18.00)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    max_tokens_per_day = EXCLUDED.max_tokens_per_day,
    max_branches = EXCLUDED.max_branches,
    max_doctors = EXCLUDED.max_doctors,
    whatsapp_msgs_per_month = EXCLUDED.whatsapp_msgs_per_month,
    support_tier = EXCLUDED.support_tier,
    gst_rate_pct = EXCLUDED.gst_rate_pct;
