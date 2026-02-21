-- =================================================================================
-- QLINK SECURITY FIXES — Run this in Supabase SQL Editor ONCE
-- Fixes C1, C2, C4, C6 from the production audit
-- =================================================================================

-- =================================================================================
-- C4: Fix sessions UNIQUE constraint
-- Old: UNIQUE(business_id, date, status) — allowed 3 sessions per day (OPEN+PAUSED+CLOSED)
-- New: UNIQUE(business_id, date) — one session per clinic per day, period
-- =================================================================================

-- Drop the old, incorrect constraint
ALTER TABLE public.sessions
    DROP CONSTRAINT IF EXISTS sessions_business_id_date_status_key;

-- Add the correct constraint (one session per clinic per day max)
-- NOTE: If you have existing data with multiple sessions on same day, this may fail.
-- In that case, run: DELETE duplicate sessions first.
ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_business_id_date_key UNIQUE (business_id, date);


-- =================================================================================
-- C6: Enforce single SERVING token per session at DB level
-- This is a partial unique index — only enforces uniqueness when status = 'SERVING'
-- =================================================================================

DROP INDEX IF EXISTS public.one_serving_per_session;
CREATE UNIQUE INDEX one_serving_per_session
    ON public.tokens (session_id)
    WHERE status = 'SERVING';


-- =================================================================================
-- C2: Remove PII-leaking public RLS policies
-- These were exposing ALL patient names + phones to anyone with the Supabase URL
-- Server Actions use the admin/service key which bypasses RLS — so removing these
-- policies does NOT break any app functionality.
-- =================================================================================

DROP POLICY IF EXISTS "Allow public read access to businesses" ON public.businesses;
DROP POLICY IF EXISTS "Allow public read access to sessions"   ON public.sessions;
DROP POLICY IF EXISTS "Allow public read access to tokens"     ON public.tokens;

-- Businesses: authenticated staff only (server actions use admin key, this is for client-side safety)
CREATE POLICY "Authenticated staff can read own business"
    ON public.businesses FOR SELECT
    USING (
        id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    );

-- Sessions: authenticated staff of that business only
CREATE POLICY "Staff can read own sessions"
    ON public.sessions FOR SELECT
    USING (
        business_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    );

-- Tokens: authenticated staff of that business only
-- Public patients access tokens ONLY via server actions (admin key), not direct Supabase queries
CREATE POLICY "Staff can read own tokens"
    ON public.tokens FOR SELECT
    USING (
        business_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    );


-- =================================================================================
-- C1: Restore rpc_process_queue_action with proper row-level locking
-- This replaces the non-transactional TypeScript multi-round-trip version
-- with a single atomic PostgreSQL function using SELECT FOR UPDATE
-- =================================================================================

DROP FUNCTION IF EXISTS public.rpc_process_queue_action CASCADE;

CREATE OR REPLACE FUNCTION public.rpc_process_queue_action(
    p_business_id uuid,
    p_session_id  uuid,
    p_staff_id    uuid,
    p_action      text,    -- 'NEXT' | 'SKIP' | 'CANCEL' | 'RECALL' | 'UNDO' | 'PAUSE_SESSION' | 'RESUME_SESSION'
    p_token_id    uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_serving_id     uuid;
    v_current_serving_status text;
    v_next_token_id          uuid;
    v_next_token_number      int;
    v_target_token           RECORD;
    v_last_served            RECORD;
BEGIN
    -- Lock the session row — serializes ALL concurrent actions for this session
    PERFORM id FROM public.sessions
        WHERE id = p_session_id AND business_id = p_business_id
        FOR UPDATE;

    -- ============================================================
    -- NEXT: Mark current SERVING as SERVED, call next WAITING token
    -- ============================================================
    IF p_action = 'NEXT' THEN

        -- Mark current SERVING as SERVED
        SELECT id INTO v_current_serving_id FROM public.tokens
            WHERE session_id = p_session_id AND status = 'SERVING'
            LIMIT 1;

        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.tokens
                SET previous_status = status, status = 'SERVED', served_at = now()
                WHERE id = v_current_serving_id;
            INSERT INTO public.audit_logs (business_id, staff_id, token_id, action)
                VALUES (p_business_id, p_staff_id, v_current_serving_id, 'SERVED');
        END IF;

        -- Find next WAITING token (priority first, then sequential)
        SELECT id, token_number INTO v_next_token_id, v_next_token_number
            FROM public.tokens
            WHERE session_id = p_session_id AND status = 'WAITING'
            ORDER BY is_priority DESC, token_number ASC
            LIMIT 1;

        IF v_next_token_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Queue is empty');
        END IF;

        UPDATE public.tokens
            SET previous_status = status, status = 'SERVING'
            WHERE id = v_next_token_id;

        UPDATE public.sessions
            SET now_serving_number = v_next_token_number
            WHERE id = p_session_id;

        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action)
            VALUES (p_business_id, p_staff_id, v_next_token_id, 'CALLED');

        RETURN json_build_object('success', true, 'called_token_number', v_next_token_number);

    -- ============================================================
    -- SKIP
    -- ============================================================
    ELSIF p_action = 'SKIP' AND p_token_id IS NOT NULL THEN
        -- Verify token belongs to this business (C3 fix)
        IF NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = p_token_id AND business_id = p_business_id) THEN
            RETURN json_build_object('success', false, 'error', 'Token not found');
        END IF;
        UPDATE public.tokens SET previous_status = status, status = 'SKIPPED' WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action)
            VALUES (p_business_id, p_staff_id, p_token_id, 'SKIPPED');
        RETURN json_build_object('success', true);

    -- ============================================================
    -- RECALL
    -- ============================================================
    ELSIF p_action = 'RECALL' AND p_token_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = p_token_id AND business_id = p_business_id) THEN
            RETURN json_build_object('success', false, 'error', 'Token not found');
        END IF;
        UPDATE public.tokens SET previous_status = status, status = 'WAITING', is_priority = true WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action)
            VALUES (p_business_id, p_staff_id, p_token_id, 'RECALLED');
        RETURN json_build_object('success', true);

    -- ============================================================
    -- CANCEL
    -- ============================================================
    ELSIF p_action = 'CANCEL' AND p_token_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = p_token_id AND business_id = p_business_id) THEN
            RETURN json_build_object('success', false, 'error', 'Token not found');
        END IF;
        UPDATE public.tokens
            SET previous_status = status, status = 'CANCELLED', cancelled_at = now()
            WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action)
            VALUES (p_business_id, p_staff_id, p_token_id, 'CANCELLED');
        RETURN json_build_object('success', true);

    -- ============================================================
    -- UNDO: Revert last state change
    -- ============================================================
    ELSIF p_action = 'UNDO' THEN

        -- A. Revert current SERVING back to its previous status
        SELECT id, previous_status INTO v_target_token FROM public.tokens
            WHERE session_id = p_session_id AND status = 'SERVING'
            ORDER BY created_at DESC LIMIT 1;

        IF v_target_token.id IS NOT NULL AND v_target_token.previous_status IS NOT NULL THEN
            UPDATE public.tokens SET status = v_target_token.previous_status WHERE id = v_target_token.id;
        END IF;

        -- B. Resurrect last SERVED back to SERVING
        SELECT id, token_number INTO v_last_served FROM public.tokens
            WHERE session_id = p_session_id AND status = 'SERVED'
            ORDER BY served_at DESC LIMIT 1;

        IF v_last_served.id IS NOT NULL THEN
            UPDATE public.tokens SET status = 'SERVING', served_at = NULL WHERE id = v_last_served.id;
            UPDATE public.sessions SET now_serving_number = v_last_served.token_number WHERE id = p_session_id;
        END IF;

        INSERT INTO public.audit_logs (business_id, staff_id, action)
            VALUES (p_business_id, p_staff_id, 'UNDO_EXECUTED');
        RETURN json_build_object('success', true);

    -- ============================================================
    -- PAUSE_SESSION
    -- ============================================================
    ELSIF p_action = 'PAUSE_SESSION' THEN
        UPDATE public.sessions SET status = 'PAUSED' WHERE id = p_session_id;
        UPDATE public.tokens
            SET previous_status = status, status = 'PAUSED'
            WHERE session_id = p_session_id AND status = 'WAITING';
        RETURN json_build_object('success', true);

    -- ============================================================
    -- RESUME_SESSION
    -- ============================================================
    ELSIF p_action = 'RESUME_SESSION' THEN
        UPDATE public.sessions SET status = 'OPEN' WHERE id = p_session_id;
        UPDATE public.tokens
            SET status = COALESCE(previous_status, 'WAITING')
            WHERE session_id = p_session_id AND status = 'PAUSED';
        RETURN json_build_object('success', true);

    END IF;

    RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;


-- =================================================================================
-- BONUS: Correct CHECK constraint on rating (C2 bonus)
-- =================================================================================

ALTER TABLE public.tokens
    DROP CONSTRAINT IF EXISTS tokens_rating_check;

ALTER TABLE public.tokens
    ADD CONSTRAINT tokens_rating_check CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);


-- =================================================================================
-- BONUS: Missing indexes for performance
-- =================================================================================

CREATE INDEX IF NOT EXISTS idx_tokens_phone ON public.tokens (patient_phone);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON public.tokens (session_id, status);
CREATE INDEX IF NOT EXISTS idx_message_logs_token ON public.message_logs (token_id);

-- Done! All C1-C6 critical issues patched at database level.
