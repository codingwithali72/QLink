-- =================================================================================
-- PHASE 1: DATABASE & CRYPTOGRAPHIC FOUNDATION
-- Master execution directive, adhering to NABH & DPDP strictness.
-- =================================================================================

-- 1. Enable pgcrypto for AES-256 encryption & UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create foundational tables

-- PATIENTS (Strict DPDP structure, age-gating support, encrypted identifying PII)
CREATE TABLE "public"."patients" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "abha_id" text,
    "abha_address" text,
    "verified_status" boolean DEFAULT false,
    "dob" date,
    "name" text NOT NULL,
    "phone" text, -- DEPRECATED: plaintext (backcompat only, marked for scrubbing)
    "phone_encrypted" text, -- AES-256 encrypted using pgcrypto
    "phone_hash" text, -- HMAC-SHA256 for deterministic indexing/lookup without decryption
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Unique constraint replacing phone lookup logic
CREATE UNIQUE INDEX "idx_patients_clinic_phone_hash_unique"
    ON "public"."patients" ("clinic_id", "phone_hash")
    WHERE phone_hash IS NOT NULL;


-- PATIENT CONSENTS (Explicit DPDP consent tracking)
CREATE TABLE "public"."patient_consents" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" uuid NOT NULL REFERENCES "public"."patients"("id") ON DELETE CASCADE,
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "purpose" text NOT NULL, -- 'QUEUE_MANAGEMENT', 'ABDM_SHARE', 'MARKETING'
    "granted_at" timestamp with time zone DEFAULT now(),
    "withdrawn_at" timestamp with time zone,
    "ip_address" text,
    "digital_signature" text,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);


-- CLINICAL VISITS (Replaces the basic "tokens" table for NABH compliance)
CREATE TABLE "public"."clinical_visits" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "session_id" uuid NOT NULL REFERENCES "public"."sessions"("id") ON DELETE CASCADE,
    "patient_id" uuid NOT NULL REFERENCES "public"."patients"("id") ON DELETE CASCADE,
    "token_number" integer NOT NULL,
    "visit_type" text NOT NULL DEFAULT 'OPD', -- 'OPD', 'IPD', 'ER', 'DAYCARE'
    "status" text NOT NULL DEFAULT 'WAITING', -- 'WAITING', 'SERVING', 'SERVED', 'CANCELLED', 'SKIPPED', 'PAUSED'
    "previous_status" text,
    "is_priority" boolean DEFAULT false,
    
    -- Strict NABH Timestamps
    "arrival_at_department_time" timestamp with time zone DEFAULT now(),
    "registration_complete_time" timestamp with time zone,
    "triage_start_time" timestamp with time zone,
    "triage_end_time" timestamp with time zone,
    "consultant_assessment_start_time" timestamp with time zone,
    "discharge_order_time" timestamp with time zone,
    "discharge_completed_time" timestamp with time zone,
    
    "created_by_staff_id" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("session_id", "token_number")
);


-- TRIAGE RECORDS (For Emergency scaling, ESI 1-5 compliance)
CREATE TABLE "public"."triage_records" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "triage_level" integer NOT NULL CHECK (triage_level BETWEEN 1 AND 5), -- ESI 1-5
    "clinical_discriminators" jsonb DEFAULT '{}'::jsonb,
    "max_permissible_wait_mins" integer NOT NULL,
    "escalated_at" timestamp with time zone,
    "triage_nurse_id" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("visit_id")
);


-- INSURANCE CLAIMS (State package workflows like MJPJAY)
CREATE TABLE "public"."insurance_claims" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "scheme_name" text NOT NULL, -- 'MJPJAY', 'PM-JAY'
    "package_code" text NOT NULL,
    "pre_auth_status" text NOT NULL DEFAULT 'PENDING',
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);


-- SECURITY AUDIT LOGS (Immutable, high-security table)
CREATE TABLE "public"."security_audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid,
    "action_type" text NOT NULL,
    "table_name" text NOT NULL,
    "record_id" uuid,
    "actor_id" uuid,
    "timestamp" timestamp with time zone DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb,
    PRIMARY KEY ("id")
);


-- =================================================================================
-- 3. STRICT CONSTRAINTS (NABH No Negative Wait Time Logic)
-- =================================================================================

CREATE OR REPLACE FUNCTION public.check_no_negative_wait_times()
RETURNS trigger AS $$
BEGIN
    -- Consultant Assessment cannot start before Arrival
    IF NEW.consultant_assessment_start_time IS NOT NULL AND NEW.arrival_at_department_time IS NOT NULL THEN
        IF NEW.consultant_assessment_start_time < NEW.arrival_at_department_time THEN
            RAISE EXCEPTION 'Constraint Violation: Negative wait time not allowed (consultant assessment before arrival)';
        END IF;
    END IF;
    
    -- Discharge completion cannot happen before Discharge order
    IF NEW.discharge_completed_time IS NOT NULL AND NEW.discharge_order_time IS NOT NULL THEN
        IF NEW.discharge_completed_time < NEW.discharge_order_time THEN
            RAISE EXCEPTION 'Constraint Violation: Negative wait time not allowed (discharge completed before ordered)';
        END IF;
    END IF;

    -- Triage end cannot be before Triage start
    IF NEW.triage_end_time IS NOT NULL AND NEW.triage_start_time IS NOT NULL THEN
        IF NEW.triage_end_time < NEW.triage_start_time THEN
            RAISE EXCEPTION 'Constraint Violation: Negative wait time not allowed (triage ended before started)';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_positive_wait_times_on_visits
BEFORE INSERT OR UPDATE ON "public"."clinical_visits"
FOR EACH ROW EXECUTE FUNCTION public.check_no_negative_wait_times();

-- Unique active clinical_visit per phone/patient in a session
CREATE UNIQUE INDEX "idx_clinical_visits_active_patient_unique"
    ON "public"."clinical_visits" ("session_id", "patient_id")
    WHERE status IN ('WAITING', 'SERVING', 'SKIPPED', 'PAUSED');


-- =================================================================================
-- 4. ENABLE STRICT ROW LEVEL SECURITY (RLS)
-- =================================================================================

ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."patient_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clinical_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."triage_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."insurance_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."security_audit_logs" ENABLE ROW LEVEL SECURITY;


-- 4A. RLS: patients
-- Restrict access to staff belonging to the same clinic
CREATE POLICY "Patients isolated by clinic" ON "public"."patients"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

-- 4B. RLS: patient_consents
CREATE POLICY "Patient Consents isolated by clinic" ON "public"."patient_consents"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

-- 4C. RLS: clinical_visits
CREATE POLICY "Clinical Visits isolated by clinic" ON "public"."clinical_visits"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

-- 4D. RLS: triage_records
CREATE POLICY "Triage Records isolated by clinic" ON "public"."triage_records"
FOR ALL USING (
    visit_id IN (
        SELECT id FROM public.clinical_visits WHERE clinic_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    )
);

-- 4E. RLS: insurance_claims
CREATE POLICY "Insurance Claims isolated by clinic" ON "public"."insurance_claims"
FOR ALL USING (
    visit_id IN (
        SELECT id FROM public.clinical_visits WHERE clinic_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    )
);

-- 4F. RLS: security_audit_logs (IMMUTABLE, NO DELETIONS/UPDATES GLOBALLY)
-- Anyone authenticated can insert if it matches their clinic, though mostly system will insert.
CREATE POLICY "Audit logs insert restricted" ON "public"."security_audit_logs"
FOR INSERT WITH CHECK (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

CREATE POLICY "Audit logs select restricted" ON "public"."security_audit_logs"
FOR SELECT USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);

REVOKE UPDATE, DELETE ON "public"."security_audit_logs" FROM PUBLIC;
REVOKE UPDATE, DELETE ON "public"."security_audit_logs" FROM authenticated;
REVOKE UPDATE, DELETE ON "public"."security_audit_logs" FROM anon;


-- =================================================================================
-- 5. ENCRYPTION UTILITY FUNCTIONS (AES-256)
-- =================================================================================

-- To be used by Edge API or Supabase internal functions for securing data in motion
CREATE OR REPLACE FUNCTION public.encrypt_dpdp_data(p_data text, p_key text)
RETURNS text AS $$
BEGIN
    -- Using pgcrypto symmetric encryption with AES
    RETURN encode(pgp_sym_encrypt(p_data, p_key, 'cipher-algo=aes256'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrypt_dpdp_data(p_cipher text, p_key text)
RETURNS text AS $$
BEGIN
    RETURN pgp_sym_decrypt(decode(p_cipher, 'base64'), p_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.hash_dpdp_data(p_data text, p_salt text)
RETURNS text AS $$
BEGIN
    -- HMAC-SHA256 for deterministic hashing (allows lookup without decrypting)
    RETURN encode(hmac(p_data, p_salt, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
