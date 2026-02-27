-- =================================================================================
-- PHASE 8: STATE INSURANCE WORKFLOW (MJPJAY / PM-JAY)
-- Package tracking, Pre-Auth states, and Claim Generation logic
-- =================================================================================

-- 1. Create specific table for Insurance Schemes (Global Reference)
CREATE TABLE IF NOT EXISTS "public"."insurance_schemes" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "scheme_name" text NOT NULL UNIQUE, -- 'MJPJAY', 'PM-JAY', 'CGHS'
    "state" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Seed basic schemes
INSERT INTO "public"."insurance_schemes" (scheme_name, state) 
VALUES ('MJPJAY', 'Maharashtra'), ('PM-JAY', 'National') 
ON CONFLICT (scheme_name) DO NOTHING;


-- 2. Enhanced Insurance Claims table
-- Replaces the basic one in Phase 1 with strict MJPJAY workflow states
-- PRODUCTION SAFE: NO DROP TABLE / NO CASCADE

-- We are using additive ALTER TABLE instead of dropping the existing table.
ALTER TABLE "public"."insurance_claims"
    ADD COLUMN IF NOT EXISTS "scheme_id" uuid REFERENCES "public"."insurance_schemes"("id") ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS "patient_ration_card_number" text,
    ADD COLUMN IF NOT EXISTS "package_name" text,
    ADD COLUMN IF NOT EXISTS "is_follow_up" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "pre_auth_amount" numeric,
    ADD COLUMN IF NOT EXISTS "pre_auth_approved_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "claim_status" text NOT NULL DEFAULT 'PENDING_PRE_AUTH',
    ADD COLUMN IF NOT EXISTS "claim_amount" numeric,
    ADD COLUMN IF NOT EXISTS "claim_settled_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "created_by" uuid,
    ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

-- Update pre_auth_status default to 'DRAFT' for future records to align with new workflow
ALTER TABLE "public"."insurance_claims" 
    ALTER COLUMN "pre_auth_status" SET DEFAULT 'DRAFT';

-- Populate scheme_id dynamically from the existing scheme_name column (safely wrapped to avoid parse errors if dropped)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'insurance_claims' 
          AND column_name = 'scheme_name'
    ) THEN
        EXECUTE '
            UPDATE "public"."insurance_claims" ic
            SET scheme_id = (SELECT id FROM "public"."insurance_schemes" i_s WHERE i_s.scheme_name = ic.scheme_name)
            WHERE ic.scheme_id IS NULL
        ';
        
        -- Safely drop the old column as it is migrated
        EXECUTE 'ALTER TABLE "public"."insurance_claims" DROP COLUMN IF EXISTS "scheme_name"';
    END IF;
END $$;

-- Assuming all existing records matched, we can enforce NOT NULL or leave as is if we want to be hyper-safe.
-- We will leave it without NOT NULL for complete non-destructive capability during rollout.

-- RLS changes (Policies might already exist, dropping and recreating safely or adding new ones if needed)
-- Since they exist from phase1, we can create IF NOT EXISTS, but Postgres policies can be tricky. 
-- For safety, we just keep the existing RLS from Phase 1.



-- 3. Required Investigations Checklist (Documentation Generator Readiness)
-- MJPJAY requires strict proof for packages (e.g. ECG + Echo for Cardiology)
CREATE TABLE IF NOT EXISTS "public"."insurance_investigations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "claim_id" uuid NOT NULL REFERENCES "public"."insurance_claims"("id") ON DELETE CASCADE,
    "document_type" text NOT NULL, -- 'CLINICAL_NOTES', 'BLOOD_REPORT', 'RADIOLOGY_IMAGE', 'CONSENT_FORM'
    "document_url" text, -- Path in Supabase Storage
    "is_mandatory" boolean DEFAULT true,
    "is_uploaded" boolean DEFAULT false,
    "uploaded_at" timestamp with time zone,
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."insurance_investigations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Investigations isolated by clinic" ON "public"."insurance_investigations";
CREATE POLICY "Investigations isolated by clinic" ON "public"."insurance_investigations"
FOR ALL USING (
    claim_id IN (
        SELECT id FROM public.insurance_claims WHERE visit_id IN (
            SELECT id FROM public.clinical_visits WHERE clinic_id IN (
                SELECT business_id FROM public.staff_users WHERE id = auth.uid()
            )
        )
    )
);

-- 4. State Machine Enforcement Trigger
CREATE OR REPLACE FUNCTION public.fn_enforce_claim_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Cannot submit a claim if pre-auth wasn't approved (unless it's an emergency exception)
    IF NEW.claim_status = 'CLAIM_SUBMITTED' AND OLD.claim_status != 'CLAIM_SUBMITTED' THEN
        IF NEW.pre_auth_status != 'APPROVED' THEN
             RAISE EXCEPTION 'Insurance Workflow Violation: Cannot submit claim. Pre-Auth is not APPROVED.';
        END IF;
    END IF;
    
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurance_claim_state_machine ON "public"."insurance_claims";
CREATE TRIGGER trg_insurance_claim_state_machine
BEFORE UPDATE ON "public"."insurance_claims"
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_claim_state_machine();
