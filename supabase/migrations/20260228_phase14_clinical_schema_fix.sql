-- =================================================================================
-- PHASE 14: CLINICAL VISITS SCHEMA ENHANCEMENTS
-- Adds missing UX/UI fields and tracking columns to clinical_visits.
-- =================================================================================

ALTER TABLE "public"."clinical_visits" 
ADD COLUMN IF NOT EXISTS "rating" integer,
ADD COLUMN IF NOT EXISTS "feedback" text,
ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'QR',
ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "served_at" timestamp with time zone;

-- Update trigger used by Phase 11 to handle old status for WHATSAPP
-- Ensuring clinical_visits has the same flow as the old tokens table.
