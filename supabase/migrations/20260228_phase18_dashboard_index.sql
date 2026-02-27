-- PHASE 1 P0 REMEDIATION: N+1 Dashboard Query Fix
-- Create composite index to optimize the real-time dashboard query for active tokens
CREATE INDEX IF NOT EXISTS idx_clinical_visits_session_status_token
ON public.clinical_visits(session_id, status, token_number);
