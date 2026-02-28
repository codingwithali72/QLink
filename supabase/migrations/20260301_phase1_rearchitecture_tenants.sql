-- =================================================================================
-- QLINK RE-ARCHITECTURE PHASE 1: STRICT MULTI-TENANT HIERARCHY
-- Transforms the legacy "businesses" flat structure into a Tenant->Branch model.
-- =================================================================================

-- 1. TENANTS (Top Level Entity: e.g. "Apollo Hospitals Group", "Dr. Batra's")
CREATE TABLE "public"."tenants" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "slug" text UNIQUE NOT NULL,
    "admin_email" text,
    "contact_phone" text,
    "plan_tier" text NOT NULL DEFAULT 'STARTER', -- 'STARTER', 'GROWTH', 'HOSPITAL'
    "status" text NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUSPENDED'
    "settings" jsonb DEFAULT '{}'::jsonb, -- Global settings (e.g. GST info, global retention rules)
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "deleted_at" timestamp with time zone,
    PRIMARY KEY ("id")
);

-- 2. BRANCHES (Replaces old "businesses" table. Physical locations)
CREATE TABLE "public"."branches" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE RESTRICT,
    "name" text NOT NULL,
    "slug" text UNIQUE NOT NULL, -- Keep slug for routing (e.g. qlink.live/b/apollo-andheri)
    "address" text,
    "contact_phone" text,
    "is_active" boolean DEFAULT true,
    "settings" jsonb DEFAULT '{}'::jsonb, -- Branch specific overrides
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Index for fast tenant routing lookup
CREATE INDEX "idx_branches_tenant" ON "public"."branches" ("tenant_id");

-- 3. DEPARTMENTS (Logical units within a branch)
-- If exist, we will migrate data. If not, this acts as the new source of truth.
-- To allow smooth migration we use CREATE TABLE IF NOT EXISTS, then ALTER to link to branch.
-- But since this is a destructive rewrite, we redefine the strict structure.

CREATE TABLE "public"."departments_v2" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE RESTRICT,
    "branch_id" uuid NOT NULL REFERENCES "public"."branches"("id") ON DELETE RESTRICT,
    "name" text NOT NULL,
    "is_active" boolean DEFAULT true,
    "avg_consultation_time" integer DEFAULT 15, -- Minutes (used for routing/EWT)
    "active_doctors_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("branch_id", "name")
);

CREATE INDEX "idx_dept_v2_branch" ON "public"."departments_v2" ("branch_id");

-- 4. DOCTORS (Assigned to Branches and Departments)
CREATE TABLE "public"."doctors_v2" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE RESTRICT,
    "branch_id" uuid NOT NULL REFERENCES "public"."branches"("id") ON DELETE RESTRICT,
    "department_id" uuid NOT NULL REFERENCES "public"."departments_v2"("id") ON DELETE RESTRICT,
    "name" text NOT NULL,
    "specialization" text,
    "phone" text,
    "is_active" boolean DEFAULT true,
    "status" text DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'PAUSED', 'EMERGENCY_ONLY', 'OFF_DUTY'
    "settings" jsonb DEFAULT '{}'::jsonb, -- Doctor specific prefs (e.g. max load, priority preference)
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE INDEX "idx_docs_v2_branch_dept" ON "public"."doctors_v2" ("branch_id", "department_id");

-- 5. SHIFTS (Time-bound availability for doctors, replacing simple open/close sessions)
CREATE TABLE "public"."shifts" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE RESTRICT,
    "branch_id" uuid NOT NULL REFERENCES "public"."branches"("id") ON DELETE RESTRICT,
    "doctor_id" uuid REFERENCES "public"."doctors_v2"("id") ON DELETE RESTRICT, -- Null = Branch-wide common queue
    "date" date NOT NULL,
    "start_time" time,
    "end_time" time,
    "status" text NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'
    "max_tokens" integer, -- Explicit cap per shift
    "tokens_generated" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("doctor_id", "date", "start_time") -- Prevent duplicate shifts for same doctor
);

-- =================================================================================
-- RLS (ROW LEVEL SECURITY) POLICIES
-- =================================================================================

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."departments_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."doctors_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;

-- Note: In Phase 2, we will migrate staff_users to map to tenant_id and branch_id 
-- so these policies can dynamically filter. For now, we stub the Super Admin access.
-- And allow public read on active branches for the QR code flow.

CREATE POLICY "Public read active branches" ON "public"."branches" 
FOR SELECT USING (is_active = true);

CREATE POLICY "Public read active departments" ON "public"."departments_v2" 
FOR SELECT USING (is_active = true);

CREATE POLICY "Public read active doctors" ON "public"."doctors_v2" 
FOR SELECT USING (is_active = true AND status != 'OFF_DUTY');
