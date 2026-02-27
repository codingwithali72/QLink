-- =================================================================================
-- HOSPITAL TRANSFORMATION 002: Queue Engine Data Model
-- Implements Phase 1.3 of the Execution Mandate
-- =================================================================================

-- 1. UPGRADE CLINICAL VISITS
-- Add Department, Doctor, and Pre-booked Appointment support safely
ALTER TABLE "public"."clinical_visits" 
ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "public"."departments"("id") ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "doctor_id" uuid REFERENCES "public"."doctors"("id") ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'WALK_IN', -- WALK_IN, APPOINTMENT, EMERGENCY
ADD COLUMN IF NOT EXISTS "appointment_time" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "estimated_service_time" timestamp with time zone;

-- Update the status enum (conceptually, stored as text) to allow SCHEDULED
-- Existing: 'WAITING', 'SERVING', 'SERVED', 'CANCELLED', 'SKIPPED', 'PAUSED'
-- New states needed for appointments: 'SCHEDULED', 'NO_SHOW'
-- (We don't need an explicit ENUM constraint modification if it's currently untyped text, but we document it here)

-- 2. INDEXES FOR SMART ROUTING
-- TV Displays need rapidly sorted lists based on estimated service time
CREATE INDEX "idx_visits_dept_status_est" ON "public"."clinical_visits" ("department_id", "status", "estimated_service_time");
CREATE INDEX "idx_visits_doc_status" ON "public"."clinical_visits" ("doctor_id", "status");

-- 3. UNIQUE CONSTRAINT UPDATE FOR DEPARTMENTS
-- The previous constraint: UNIQUE ("session_id", "token_number")
-- This would fail in a multi-department hospital where Dept A and Dept B both have Token 1.
-- We must alter the unique constraint to be Department-aware.
ALTER TABLE "public"."clinical_visits" DROP CONSTRAINT IF EXISTS "clinical_visits_session_id_token_number_key";

-- If the constraint wasn't named explicitly, we might need to find its name dynamically or just add the new one.
-- Let's explicitly create the new one. It will enforce uniqueness per department per session.
CREATE UNIQUE INDEX "idx_clinical_visits_session_dept_token" 
ON "public"."clinical_visits" ("session_id", "department_id", "token_number");

-- 4. DEPARTMENT-AWARE ACTIVE PATIENT CONSTRAINT
-- A patient can be active in multiple departments at once (e.g., Blood Test then X-Ray).
-- We must change the active patient constraint to look at session + department.
DROP INDEX IF EXISTS "idx_clinical_visits_active_patient_unique";

CREATE UNIQUE INDEX "idx_clinical_visits_active_patient_dept_unique"
ON "public"."clinical_visits" ("session_id", "patient_id", "department_id")
WHERE status IN ('WAITING', 'SERVING', 'SKIPPED', 'PAUSED');

-- =================================================================================
-- RLS POLICIES REMAIN INHERITED FROM PHASE 1
-- (Visits are already isolated by clinic_id)
-- =================================================================================
