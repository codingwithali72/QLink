-- =================================================================================
-- QLINK MIGRATION: STRICT TENANT ISOLATION (RLS)
-- Execution Phase 1: Securing the database for Multi-Tenant Scaling
-- =================================================================================

-- 1. DROP ALL EXISTING PERMISSIVE POLICIES
DROP POLICY IF EXISTS "Allow public read access to businesses" ON "public"."businesses";
DROP POLICY IF EXISTS "Allow public read access to sessions" ON "public"."sessions";
DROP POLICY IF EXISTS "Allow public read access to tokens" ON "public"."tokens";
DROP POLICY IF EXISTS "Allow authenticated read access to tokens" ON "public"."tokens";

-- 2. STAFF_USERS RLS
-- Staff can only read and update their own profile
CREATE POLICY "Staff can view their own profile" ON "public"."staff_users"
FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Staff can update their own profile" ON "public"."staff_users"
FOR UPDATE TO authenticated USING (id = auth.uid());

-- 3. BUSINESSES RLS
-- Staff can only read the business they are assigned to
CREATE POLICY "Staff can view their assigned business" ON "public"."businesses"
FOR SELECT TO authenticated USING (
    id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- 4. SESSIONS RLS
-- Staff can only read/update sessions for their assigned business
CREATE POLICY "Staff can view sessions for their assigned business" ON "public"."sessions"
FOR SELECT TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

CREATE POLICY "Staff can update sessions for their assigned business" ON "public"."sessions"
FOR UPDATE TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- 5. TOKENS RLS
-- Staff can only read/update tokens for their assigned business
CREATE POLICY "Staff can view tokens for their assigned business" ON "public"."tokens"
FOR SELECT TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

CREATE POLICY "Staff can insert tokens for their assigned business" ON "public"."tokens"
FOR INSERT TO authenticated WITH CHECK (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

CREATE POLICY "Staff can update tokens for their assigned business" ON "public"."tokens"
FOR UPDATE TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- 6. AUDIT LOGS RLS
CREATE POLICY "Staff can view audit logs for their assigned business" ON "public"."audit_logs"
FOR SELECT TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- Note: No insertions or updates via RLS for audit_logs since they are written exclusively by Secure RPCs.

-- 7. MESSAGE LOGS RLS
CREATE POLICY "Staff can view message logs for their assigned business" ON "public"."message_logs"
FOR SELECT TO authenticated USING (
    business_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);
