-- Deepcore VAPT Remediation: Revoke all public read access policies
-- Since the frontend exclusively uses Next.js Server Actions (with the Service Role Key),
-- there is absolutely no reason for the Supabase Anon Key to have SELECT permissions
-- on any PII or operational tables. This closes a massive data exfiltration loophole.

DROP POLICY IF EXISTS "Allow public read access to businesses" ON "public"."businesses";
DROP POLICY IF EXISTS "Allow public read access to sessions" ON "public"."sessions";
DROP POLICY IF EXISTS "Allow public read access to tokens" ON "public"."tokens";
DROP POLICY IF EXISTS "Allow public read access to clinic_daily_stats" ON "public"."clinic_daily_stats";

-- Ensure Realtime broadcast is off for tokens to prevent leakage via websockets
ALTER PUBLICATION supabase_realtime DROP TABLE "public"."tokens";
ALTER PUBLICATION supabase_realtime DROP TABLE "public"."sessions";
