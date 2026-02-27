-- =================================================================================
-- HOSPITAL TRANSFORMATION 001: Structural Taxonomy
-- Implements Phase 1.1 and 1.2 of the Execution Mandate
-- =================================================================================

-- 1. HOSPITALS (Parent Tenant)
-- "businesses" acts as the Branch/Clinic level. We add a parent Hospital entity
-- to group multiple branches together for enterprise deployments.
CREATE TABLE "public"."hospitals" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "slug" text NOT NULL,
    "name" text NOT NULL,
    "contact_email" text,
    "contact_phone" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("slug")
);

-- Alter existing businesses to support a parent hospital
ALTER TABLE "public"."businesses" 
ADD COLUMN "hospital_id" uuid REFERENCES "public"."hospitals"("id") ON DELETE SET NULL;

-- 2. DEPARTMENTS
-- Sub-queues within a branch (e.g., Pediatrics, Cardiology)
CREATE TABLE "public"."departments" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "is_active" boolean DEFAULT true,
    "routing_strategy" text NOT NULL DEFAULT 'POOLED', -- POOLED, SINGLE_DOCTOR, ROUND_ROBIN
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("clinic_id", "name")
);

-- 3. DOCTORS
-- Identifies physical doctors working in a department. Can optionally link to auth.users.
CREATE TABLE "public"."doctors" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "department_id" uuid NOT NULL REFERENCES "public"."departments"("id") ON DELETE CASCADE,
    "user_id" uuid REFERENCES "public"."staff_users"("id") ON DELETE SET NULL,
    "name" text NOT NULL,
    "specialization" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- 4. DOCTOR SHIFTS
-- Doctors must have an active shift to be assigned tokens in a POOLED department.
CREATE TABLE "public"."doctor_shifts" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "doctor_id" uuid NOT NULL REFERENCES "public"."doctors"("id") ON DELETE CASCADE,
    "session_id" uuid NOT NULL REFERENCES "public"."sessions"("id") ON DELETE CASCADE,
    "shift_start" timestamp with time zone NOT NULL DEFAULT now(),
    "shift_end" timestamp with time zone,
    "status" text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, COMPLETED
    "tokens_served" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("doctor_id", "session_id", "status") -- Prevent duplicate active shifts
);

-- =================================================================================
-- RLS POLICIES FOR NEW TABLES
-- =================================================================================

ALTER TABLE "public"."hospitals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."doctors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."doctor_shifts" ENABLE ROW LEVEL SECURITY;

-- Hospitals: Visible if auth user is in a business linked to this hospital
CREATE POLICY "Hospitals visible to linked staff" ON "public"."hospitals" FOR SELECT USING (
    id IN (SELECT hospital_id FROM public.businesses WHERE id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid()))
);

-- Departments: Isolated by clinic
CREATE POLICY "Departments isolated by clinic" ON "public"."departments" FOR ALL USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- Doctors: Isolated by clinic (via department)
CREATE POLICY "Doctors isolated by clinic" ON "public"."doctors" FOR ALL USING (
    department_id IN (SELECT id FROM public.departments WHERE clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid()))
);

-- Shifts: Isolated by clinic (via doctor)
CREATE POLICY "Doctor shifts isolated by clinic" ON "public"."doctor_shifts" FOR ALL USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE department_id IN (SELECT id FROM public.departments WHERE clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())))
);

-- Indexes for performance
CREATE INDEX "idx_departments_clinic" ON "public"."departments" ("clinic_id");
CREATE INDEX "idx_doctors_department" ON "public"."doctors" ("department_id");
CREATE INDEX "idx_doctor_shifts_doctor_status" ON "public"."doctor_shifts" ("doctor_id", "status");
