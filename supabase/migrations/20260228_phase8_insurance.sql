-- =================================================================================
-- PHASE 8: STATE INSURANCE WORKFLOW (MJPJAY / PM-JAY)
-- Package tracking, Pre-Auth states, and Claim Generation logic
-- =================================================================================

-- 1. Create specific table for Insurance Schemes (Global Reference)
CREATE TABLE "public"."insurance_schemes" (
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
DROP TABLE IF EXISTS "public"."insurance_claims" CASCADE;

CREATE TABLE "public"."insurance_claims" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "scheme_id" uuid NOT NULL REFERENCES "public"."insurance_schemes"("id") ON DELETE RESTRICT,
    
    -- MJPJAY specific fields
    "patient_ration_card_number" text,
    "package_code" text NOT NULL, -- e.g. M102030 (Medical Oncology)
    "package_name" text,
    "is_follow_up" boolean DEFAULT false,
    
    -- Strict State Machine for Claim Lifecycle
    "pre_auth_status" text NOT NULL DEFAULT 'DRAFT', 
       -- States: DRAFT -> SUBMITTED -> APPROVED -> REJECTED -> QUERY_RAISED
    
    "pre_auth_amount" numeric,
    "pre_auth_approved_at" timestamp with time zone,
    
    "claim_status" text NOT NULL DEFAULT 'PENDING_PRE_AUTH',
       -- States: PENDING_PRE_AUTH -> DISCHARGED_PENDING_SUBMISSION -> CLAIM_SUBMITTED -> SETTLED
       
    "claim_amount" numeric,
    "claim_settled_at" timestamp with time zone,
    
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."insurance_claims" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claims isolated by clinic" ON "public"."insurance_claims"
FOR ALL USING (
    visit_id IN (
        SELECT id FROM public.clinical_visits WHERE clinic_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    )
);


-- 3. Required Investigations Checklist (Documentation Generator Readiness)
-- MJPJAY requires strict proof for packages (e.g. ECG + Echo for Cardiology)
CREATE TABLE "public"."insurance_investigations" (
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

CREATE TRIGGER trg_insurance_claim_state_machine
BEFORE UPDATE ON "public"."insurance_claims"
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_claim_state_machine();
