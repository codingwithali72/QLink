-- Deepcore VAPT Remediation Day 2:
-- Fix missing RLS on export_logs and remove the dangerous tokens insert policy.

-- 1. Export Logs were missing RLS completely. Enforce Service Role only.
ALTER TABLE "public"."export_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Only" ON "public"."export_logs";
CREATE POLICY "Service Role Only" ON "public"."export_logs"
    FOR ALL USING (false); -- Implicitly allows service role, denies all others

-- 2. Tokens insert policy was overly permissive (allows bypassing daily_token_limit via direct insert)
-- We remove it, forcing all token creations through `create_token_atomic` RPC (which uses security definer)
DROP POLICY IF EXISTS "Allow authenticated staff to create tokens" ON "public"."tokens";
