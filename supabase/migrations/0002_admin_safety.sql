-- =================================================================================
-- MIGRATION: 0002_admin_safety.sql
-- Phase 1 Admin Safety Fixes
-- Run this in Supabase SQL Editor after 0001_security_fixes.sql
-- =================================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADMIN AUDIT LOG TABLE
--    Tracks every super admin action for full accountability
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type text NOT NULL,   -- 'SUSPEND_CLINIC', 'RESET_SESSION', 'DELETE_CLINIC', etc
    target_type text NOT NULL,   -- 'BUSINESS', 'STAFF', 'SESSION', 'TOKEN'
    target_id   uuid,
    target_slug text,            -- human-readable reference
    actor_email text NOT NULL,
    actor_ip    text,
    metadata    jsonb DEFAULT '{}',
    created_at  timestamptz DEFAULT now()
);

-- Index for actor lookups (who did what)
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor
    ON public.admin_audit_logs(actor_email, created_at DESC);

-- Index for target lookups (what happened to this clinic)
CREATE INDEX IF NOT EXISTS idx_admin_audit_target
    ON public.admin_audit_logs(target_id, created_at DESC);

-- RLS: only service role can read/write (admin client bypasses RLS)
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- No public policies — admin client (service key) is the only accessor


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PERFORMANCE INDEXES FOR ADMIN DASHBOARD QUERIES
--    Critical for getAdminStats performance at 1000 clinics
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-clinic token queries (used in usage monitoring)
CREATE INDEX IF NOT EXISTS idx_tokens_business_date
    ON public.tokens(business_id, created_at DESC);

-- Per-clinic message queries (delivery rate, cost tracking)
CREATE INDEX IF NOT EXISTS idx_message_logs_business_date
    ON public.message_logs(business_id, created_at DESC);

-- Session status queries (active clinics dashboard)
CREATE INDEX IF NOT EXISTS idx_sessions_date_status
    ON public.sessions(date, status);

-- Audit log per clinic
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
    ON public.audit_logs(business_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. STATUS COLUMN FOR BUSINESSES (more expressive than is_active boolean)
--    Does NOT remove is_active — both coexist for backward compatibility
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED', 'TRIAL'));

-- Backfill: is_active=false → SUSPENDED
UPDATE public.businesses SET status = 'SUSPENDED' WHERE is_active = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SETTINGS DEFAULTS (ensure businesses.settings has required keys)
--    No schema change — uses existing jsonb column
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.businesses
SET settings = settings || jsonb_build_object(
    'plan', COALESCE(settings->>'plan', 'FREE'),
    'qr_intake_enabled', COALESCE((settings->>'qr_intake_enabled')::boolean, true),
    'daily_token_limit', COALESCE((settings->>'daily_token_limit')::int, 200),
    'max_active_tokens', COALESCE((settings->>'max_active_tokens')::int, 50),
    'daily_message_limit', COALESCE((settings->>'daily_message_limit')::int, 300),
    'whatsapp_enabled', COALESCE((settings->>'whatsapp_enabled')::boolean, true),
    'retention_days', COALESCE((settings->>'retention_days')::int, 90),
    'billing_status', COALESCE(settings->>'billing_status', 'ACTIVE')
)
WHERE true;
