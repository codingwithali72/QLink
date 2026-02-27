-- =================================================================================
-- PHASE 6 REMEDIATION: Strict Database Constraints (Hardening)
-- Objective: Prevent cascading collapse & Enforce DPDP at DB level
-- =================================================================================

-- 1. Prevent Cascading Deletions on Core Tables
-- Change ON DELETE CASCADE to ON DELETE RESTRICT for critical lookups

ALTER TABLE "public"."clinical_visits"
  DROP CONSTRAINT IF EXISTS clinical_visits_clinic_id_fkey,
  DROP CONSTRAINT IF EXISTS clinical_visits_session_id_fkey,
  DROP CONSTRAINT IF EXISTS clinical_visits_patient_id_fkey;

ALTER TABLE "public"."clinical_visits"
  ADD CONSTRAINT clinical_visits_clinic_id_fkey FOREIGN KEY ("clinic_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT clinical_visits_session_id_fkey FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT clinical_visits_patient_id_fkey FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."patients"
  DROP CONSTRAINT IF EXISTS patients_clinic_id_fkey;

ALTER TABLE "public"."patients"
  ADD CONSTRAINT patients_clinic_id_fkey FOREIGN KEY ("clinic_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."patient_consents"
  DROP CONSTRAINT IF EXISTS patient_consents_patient_id_fkey,
  DROP CONSTRAINT IF EXISTS patient_consents_clinic_id_fkey;

ALTER TABLE "public"."patient_consents"
  ADD CONSTRAINT patient_consents_patient_id_fkey FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT patient_consents_clinic_id_fkey FOREIGN KEY ("clinic_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT;

ALTER TABLE "public"."sessions"
  DROP CONSTRAINT IF EXISTS sessions_business_id_fkey;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT sessions_business_id_fkey FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE RESTRICT;


-- 2. Add strict DPDP Constraint Pattern to Patients
-- Ensures every patient has valid contact data mechanism (either legacy or encrypted)

ALTER TABLE "public"."patients"
  ADD CONSTRAINT patients_dpdp_contact_check 
  CHECK (phone IS NOT NULL OR (phone_encrypted IS NOT NULL AND phone_hash IS NOT NULL));

-- 3. Structure Log Integrity
ALTER TABLE "public"."whatsapp_messages"
  ALTER COLUMN message_type SET NOT NULL,
  ALTER COLUMN direction SET NOT NULL;
