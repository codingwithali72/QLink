-- =================================================================================
-- MIGRATION: 20260225 — DATA INTEGRITY FIXES
-- Fixes state machine gaps, analytics accuracy issues, and adds patient self-cancel support.
-- =================================================================================

-- =================================================================================
-- FIX 1: rpc_force_close_session — Terminal State Coverage
--
-- Previous bug: Only WAITING tokens were cancelled on force-close.
-- SERVING tokens stayed in SERVING forever (ghost state).
-- SKIPPED tokens stayed in SKIPPED forever (unresolvable limbo).
-- RECALLED tokens stayed in RECALLED forever (same problem).
--
-- Fix: Cancel all non-terminal tokens (WAITING, SERVING, SKIPPED, RECALLED, PAUSED)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_force_close_session(
    p_business_id uuid,
    p_staff_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id       uuid;
    v_today            date;
    v_cancelled_count  int := 0;
BEGIN
    v_today := TIMEZONE('Asia/Kolkata', now())::date;

    -- Lock the session row
    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE business_id = p_business_id
      AND date = v_today
      AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active session found for today.');
    END IF;

    -- FIX: Cancel ALL non-terminal tokens — not just WAITING ones.
    -- Previously SERVING, SKIPPED, RECALLED, and PAUSED tokens were left in
    -- non-terminal states indefinitely after a force close.
    WITH cancelled AS (
        UPDATE public.tokens
        SET    status          = 'CANCELLED',
               previous_status = status,
               cancelled_at   = now()
        WHERE  session_id = v_session_id
          AND  status NOT IN ('SERVED', 'CANCELLED')   -- skip already-terminal tokens
        RETURNING id
    )
    SELECT count(*) INTO v_cancelled_count FROM cancelled;

    -- Close the session
    UPDATE public.sessions
    SET status    = 'CLOSED',
        closed_at = now()
    WHERE id = v_session_id;

    -- System Audit Log
    INSERT INTO public.system_audit_logs (
        clinic_id, actor_id, actor_role, action_type, entity_type, entity_id, metadata
    ) VALUES (
        p_business_id, p_staff_id, 'SUPER_ADMIN', 'SESSION_FORCE_CLOSED', 'session', v_session_id,
        jsonb_build_object('tokens_cancelled', v_cancelled_count)
    );

    RETURN json_build_object(
        'success',          true,
        'session_id',       v_session_id,
        'cancelled_tokens', v_cancelled_count
    );
END;
$$;


-- =================================================================================
-- FIX 2: refresh_clinic_daily_stats — Avg Wait Time Precision
--
-- Previous: EXTRACT(EPOCH FROM AVG(...)) / 60 — ROUND() casts to integer, losing
-- sub-minute precision. For the weighted average in TypeScript to be accurate,
-- the DB needs at least 2 decimal places.
--
-- Also adds a guard: tokens where served_at < created_at (data corruption / clock skew)
-- are excluded from the average to prevent negative wait times poisoning the metric.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.refresh_clinic_daily_stats(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.clinic_daily_stats (
        business_id, date,
        total_tokens, served_count, skipped_count, cancelled_count,
        recall_count, emergency_count, active_tokens,
        avg_wait_time_minutes, avg_rating,
        whatsapp_count, sms_count, updated_at
    )
    SELECT
        b.id    AS business_id,
        p_date  AS date,

        COALESCE(COUNT(t.id), 0)                                                                        AS total_tokens,
        COALESCE(SUM(CASE WHEN t.status = 'SERVED'    THEN 1 ELSE 0 END), 0)                           AS served_count,
        COALESCE(SUM(CASE WHEN t.status = 'SKIPPED'   THEN 1 ELSE 0 END), 0)                           AS skipped_count,
        COALESCE(SUM(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END), 0)                           AS cancelled_count,

        -- Recall count from audit_logs (more accurate than token status snapshot)
        (
            SELECT COUNT(*)
            FROM   public.audit_logs al
            WHERE  al.business_id = b.id
              AND  al.action      = 'RECALLED'
              AND  (al.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
        )                                                                                               AS recall_count,

        COALESCE(SUM(CASE WHEN t.is_priority = true THEN 1 ELSE 0 END), 0)                             AS emergency_count,

        -- Active = all non-terminal states
        COALESCE(SUM(CASE WHEN t.status IN ('WAITING','SERVING','SKIPPED','RECALLED','PAUSED')
                          THEN 1 ELSE 0 END), 0)                                                        AS active_tokens,

        -- FIX: 2 decimal places, and exclude corrupted rows (served_at < created_at)
        COALESCE(
            ROUND(
                EXTRACT(EPOCH FROM AVG(
                    CASE
                        WHEN t.status = 'SERVED'
                         AND t.served_at IS NOT NULL
                         AND t.served_at > t.created_at  -- guard against clock skew / data corruption
                        THEN (t.served_at - t.created_at)
                        ELSE NULL
                    END
                )) / 60,
                2   -- 2 decimal places for weighted-avg accuracy in TypeScript
            ),
            0
        )                                                                                               AS avg_wait_time_minutes,

        -- Average rating (NULL if no ratings exist for the day)
        CASE WHEN COUNT(t.rating) > 0 THEN ROUND(AVG(t.rating), 2) ELSE NULL END                      AS avg_rating,

        (
            SELECT COUNT(*)
            FROM   public.message_logs ml
            WHERE  ml.business_id = b.id
              AND  ml.provider    = 'WHATSAPP'
              AND  (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
        )                                                                                               AS whatsapp_count,
        0                                                                                               AS sms_count,
        now()                                                                                           AS updated_at

    FROM public.businesses b
    LEFT JOIN public.sessions s ON s.business_id = b.id AND s.date = p_date
    LEFT JOIN public.tokens   t ON t.session_id  = s.id
    -- Exclude soft-deleted clinics from analytics aggregation
    WHERE b.deleted_at IS NULL
    GROUP BY b.id, p_date

    ON CONFLICT (business_id, date) DO UPDATE SET
        total_tokens          = EXCLUDED.total_tokens,
        served_count          = EXCLUDED.served_count,
        skipped_count         = EXCLUDED.skipped_count,
        cancelled_count       = EXCLUDED.cancelled_count,
        recall_count          = EXCLUDED.recall_count,
        emergency_count       = EXCLUDED.emergency_count,
        active_tokens         = EXCLUDED.active_tokens,
        avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
        avg_rating            = EXCLUDED.avg_rating,
        whatsapp_count        = EXCLUDED.whatsapp_count,
        sms_count             = EXCLUDED.sms_count,
        updated_at            = now();
END;
$$;


-- =================================================================================
-- FIX 3: Add patient_phone_hash column to tokens (if missing)
--
-- Required for the patientCancelToken server action to do secure phone-ownership
-- verification without decrypting the phone (preserves DPDP compliance).
-- The hash is HMAC-SHA256 — same as patient_phone_hash written at token creation.
-- =================================================================================
ALTER TABLE public.tokens
    ADD COLUMN IF NOT EXISTS patient_phone_hash text;

-- Index for fast hash-based lookup (used in patient self-cancel + dedup)
CREATE INDEX IF NOT EXISTS idx_tokens_phone_hash
    ON public.tokens (session_id, patient_phone_hash)
    WHERE patient_phone_hash IS NOT NULL;


-- =================================================================================
-- FIX 4: Performance Indexes — missing for 100-clinic scale
--
-- These queries run on every dashboard load and every action.
-- Without these, each grows to O(table_size) full scans at 100 clinics.
-- =================================================================================

-- Primary queue fetch: status + business_id (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_tokens_business_created
    ON public.tokens (business_id, created_at DESC);

-- Analytics date-range queries on tokens (for live today stats in getClinicMetrics)
CREATE INDEX IF NOT EXISTS idx_tokens_business_created_at_tz
    ON public.tokens (business_id, created_at);

-- Allows fast lookup of SERVED tokens for avg wait calculation
CREATE INDEX IF NOT EXISTS idx_tokens_served_at
    ON public.tokens (session_id, served_at)
    WHERE status = 'SERVED' AND served_at IS NOT NULL;

-- Audit log lookup by action type (RECALLED, PATIENT_SELF_CANCEL, etc.)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON public.audit_logs (business_id, action, created_at DESC);


-- =================================================================================
-- VERIFICATION QUERIES (uncomment to validate after applying)
-- =================================================================================

-- Confirm all tokens are in a valid state (no orphaned non-terminal tokens in closed sessions)
-- SELECT t.status, COUNT(*) FROM tokens t
-- JOIN sessions s ON s.id = t.session_id
-- WHERE s.status = 'CLOSED' AND t.status NOT IN ('SERVED', 'CANCELLED')
-- GROUP BY t.status;

-- Confirm avg_wait_time_minutes has decimal precision
-- SELECT business_id, date, avg_wait_time_minutes FROM clinic_daily_stats LIMIT 5;

-- Confirm patient_phone_hash index
-- SELECT indexname FROM pg_indexes WHERE tablename = 'tokens' AND indexname = 'idx_tokens_phone_hash';
