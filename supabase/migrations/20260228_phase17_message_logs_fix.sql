-- =================================================================================
-- PHASE 17: MESSAGE LOGS CLINICAL UPDATE
-- Adds visit_id to message_logs for clinical architecture alignment.
-- =================================================================================

ALTER TABLE "public"."message_logs"
DROP CONSTRAINT IF EXISTS "message_logs_token_id_fkey",
ADD COLUMN IF NOT EXISTS "visit_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE SET NULL;
