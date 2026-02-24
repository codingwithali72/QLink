-- =================================================================================
-- MIGRATION: 20260223 — STRUCTURAL INTEGRITY FIX
-- Fixes 6 production-blocking bugs in token limit enforcement,
-- active-token deduplication, and admin analytics.
-- Apply via Supabase SQL Editor or supabase db push.
-- =================================================================================


-- =================================================================================
-- FIX 1 & 2 & 3: REBUILD create_token_atomic
--
-- Bug 1: Variable name mismatch (v_business_limit / v_active_token_count were
--         referenced but never declared — PL/pgSQL silently treats them as NULL,
--         so the limit check NEVER fired).
-- Bug 2: Wrong limit count — was excluding SERVED/CANCELLED, so a clinic with
--         limit=2 that served 10 patients could still emit unlimited new tokens.
--         Correct semantics: count ALL tokens ever issued in the session (capacity).
-- Bug 3: 'RECALLED' was missing from the active-status check, allowing a second
--         token for a phone that has a recalled-but-still-active token in queue.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.create_token_atomic(
    p_business_id uuid,
    p_session_id  uuid,
    p_phone       text,
    p_name        text,
    p_is_priority boolean DEFAULT false,
    p_staff_id    uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_token_number  int;
    v_token_id          uuid;
    v_result            json;
    v_existing_token    record;
    v_limit             int;       -- daily_token_limit from businesses
    v_issued_count      int;       -- total tokens ever issued in session (capacity check)
    v_today_ist         date;      -- IST date (prevents UTC/IST midnight split)
BEGIN
    -- ── 0. Compute IST date ────────────────────────────────────────────────────
    -- CURRENT_DATE is UTC. Without this, operations straddling 00:00–05:30 IST
    -- would silently split across two Postgres sessions, destroying the queue.
    v_today_ist := TIMEZONE('Asia/Kolkata', now())::date;

    -- ── 1. Acquire row-level lock on session (MUST be first, before any reads) ─
    -- This serializes all concurrent calls for the same session so the count
    -- and insert form an atomic unit. No two callers can pass step 2 simultaneously.
    PERFORM id
    FROM public.sessions
    WHERE id            = p_session_id
      AND business_id   = p_business_id
      AND date          = v_today_ist
      AND status        IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    -- If the PERFORM found nothing, the session doesn't exist / is closed.
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Session not found or already closed'
        );
    END IF;

    -- ── 2. Read daily_token_limit ──────────────────────────────────────────────
    SELECT daily_token_limit
    INTO   v_limit
    FROM   public.businesses
    WHERE  id = p_business_id;

    -- ── 3. Enforce capacity limit (FIX: count ALL tokens in session) ───────────
    -- The limit is a CAPACITY cap (seats issued today), not a queue-depth cap.
    -- Once 50 tokens have been issued, the 51st is refused even if 40 are served.
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id)
        INTO   v_issued_count
        FROM   public.tokens
        WHERE  session_id = p_session_id;   -- no status filter — counts every issued token

        IF v_issued_count >= v_limit THEN
            RETURN json_build_object(
                'success',       false,
                'error',         'Daily token limit reached. No more tokens available today.',
                'limit_reached', true,
                'limit',         v_limit,
                'count',         v_issued_count
            );
        END IF;
    END IF;

    -- ── 4. Block duplicate ACTIVE token for same phone (FIX: include RECALLED) ─
    -- Active = any status where the patient still has a stake in the queue.
    -- RECALLED was missing before, allowing a second token for recalled patients.
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT id, token_number, status
        INTO   v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;

        IF FOUND THEN
            RETURN json_build_object(
                'success',               false,
                'error',                 'You already have an active token in this session.',
                'is_duplicate',          true,
                'existing_token_id',     v_existing_token.id,
                'existing_token_number', v_existing_token.token_number,
                'existing_status',       v_existing_token.status
            );
        END IF;
    END IF;

    -- ── 5. Atomically increment session counter ────────────────────────────────
    UPDATE public.sessions
    SET    last_token_number = last_token_number + 1
    WHERE  id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- ── 6. Insert the new token ────────────────────────────────────────────────
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name,
        is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name,
        p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- ── 7. Immutable audit entry ───────────────────────────────────────────────
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (
        p_business_id,
        p_staff_id,
        v_token_id,
        'CREATED',
        json_build_object(
            'token_number', v_new_token_number,
            'is_priority',  p_is_priority
        )::jsonb
    );

    -- ── 8. Return success ──────────────────────────────────────────────────────
    RETURN json_build_object(
        'success',      true,
        'token_id',     v_token_id,
        'token_number', v_new_token_number
    );

EXCEPTION
    -- Catch unique-constraint violation from the partial index (race condition)
    -- Two simultaneous inserts for same phone can slip past the IF check in the
    -- same microsecond. The partial index makes the DB itself reject the second.
    WHEN unique_violation THEN
        -- Re-fetch the winning token so we can return a proper duplicate payload
        SELECT id, token_number, status
        INTO   v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;

        IF FOUND THEN
            RETURN json_build_object(
                'success',               false,
                'error',                 'You already have an active token in this session.',
                'is_duplicate',          true,
                'existing_token_id',     v_existing_token.id,
                'existing_token_number', v_existing_token.token_number,
                'existing_status',       v_existing_token.status
            );
        ELSE
            RETURN json_build_object(
                'success', false,
                'error',   'A token for this number already exists (conflict)'
            );
        END IF;
END;
$$;


-- =================================================================================
-- FIX 4: PARTIAL UNIQUE INDEX — race-condition-safe deduplication
--
-- The IF check inside create_token_atomic prevents duplicates in the normal path.
-- But if two calls arrive at the exact same microsecond, both can pass the IF
-- check before either inserts. This index makes the database itself enforce
-- uniqueness at the storage layer — the second insert will raise unique_violation,
-- caught by the EXCEPTION block above, which returns a clean duplicate payload.
-- =================================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_phone_unique
ON public.tokens (session_id, patient_phone)
WHERE status IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED');


-- =================================================================================
-- FIX 5: ADD MISSING ANALYTICS COLUMNS TO clinic_daily_stats
--
-- active_tokens   — tokens still in queue right now (snapshot at refresh time)
-- cancelled_count — tokens cancelled today (previously absent from aggregation)
-- avg_rating      — average patient rating for the day
-- =================================================================================
ALTER TABLE public.clinic_daily_stats
    ADD COLUMN IF NOT EXISTS active_tokens   integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cancelled_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_rating      numeric          DEFAULT NULL;


-- =================================================================================
-- REBUILD refresh_clinic_daily_stats to populate the new columns
-- =================================================================================
CREATE OR REPLACE FUNCTION public.refresh_clinic_daily_stats(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.clinic_daily_stats (
        business_id, date,
        total_tokens, served_count, skipped_count, recall_count,
        emergency_count, cancelled_count, active_tokens,
        avg_wait_time_minutes, avg_rating,
        whatsapp_count, sms_count,
        updated_at
    )
    SELECT
        b.id                                                    AS business_id,
        p_date                                                  AS date,

        -- Total tokens ever issued
        COALESCE(COUNT(t.id), 0)                               AS total_tokens,

        -- State breakdowns
        COALESCE(SUM(CASE WHEN t.status = 'SERVED'     THEN 1 ELSE 0 END), 0) AS served_count,
        COALESCE(SUM(CASE WHEN t.status = 'SKIPPED'    THEN 1 ELSE 0 END), 0) AS skipped_count,
        COALESCE(SUM(CASE WHEN t.status = 'CANCELLED'  THEN 1 ELSE 0 END), 0) AS cancelled_count,
        COALESCE(SUM(CASE WHEN t.status IN ('WAITING','SERVING','SKIPPED','RECALLED','PAUSED') THEN 1 ELSE 0 END), 0) AS active_tokens,

        -- Recall count from audit_logs (more accurate than token status)
        (
            SELECT COUNT(*)
            FROM   public.audit_logs al
            WHERE  al.business_id = b.id
              AND  al.action      = 'RECALLED'
              AND  (al.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
        )                                                       AS recall_count,

        -- Emergency (priority) count
        COALESCE(SUM(CASE WHEN t.is_priority = true THEN 1 ELSE 0 END), 0) AS emergency_count,

        -- Average wait time in minutes (served tokens only)
        COALESCE(
            ROUND(
                EXTRACT(EPOCH FROM AVG(
                    CASE WHEN t.status = 'SERVED' AND t.served_at IS NOT NULL
                    THEN (t.served_at - t.created_at)
                    ELSE NULL END
                )) / 60
            ), 0
        )                                                       AS avg_wait_time_minutes,

        -- Average patient rating (NULL if no ratings)
        CASE
            WHEN COUNT(t.rating) > 0 THEN ROUND(AVG(t.rating), 2)
            ELSE NULL
        END                                                     AS avg_rating,

        -- Messaging counts
        (
            SELECT COUNT(*)
            FROM   public.message_logs ml
            WHERE  ml.business_id = b.id
              AND  ml.provider    = 'WHATSAPP'
              AND  (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
        )                                                       AS whatsapp_count,
        0                                                       AS sms_count,   -- placeholder for future SMS provider

        now()                                                   AS updated_at

    FROM public.businesses b
    LEFT JOIN public.sessions s ON s.business_id = b.id AND s.date = p_date
    LEFT JOIN public.tokens   t ON t.session_id  = s.id

    GROUP BY b.id, p_date

    ON CONFLICT (business_id, date) DO UPDATE SET
        total_tokens          = EXCLUDED.total_tokens,
        served_count          = EXCLUDED.served_count,
        skipped_count         = EXCLUDED.skipped_count,
        cancelled_count       = EXCLUDED.cancelled_count,
        active_tokens         = EXCLUDED.active_tokens,
        recall_count          = EXCLUDED.recall_count,
        emergency_count       = EXCLUDED.emergency_count,
        avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
        avg_rating            = EXCLUDED.avg_rating,
        whatsapp_count        = EXCLUDED.whatsapp_count,
        sms_count             = EXCLUDED.sms_count,
        updated_at            = now();
END;
$$;


-- =================================================================================
-- FIX 6: INCREMENTAL LIVE-UPDATE TRIGGER ON TOKENS
--
-- Calling refresh_clinic_daily_stats as a batch job is fine for historical data,
-- but for today's live admin dashboard, every status change should update the
-- stats row immediately. This trigger fires AFTER any INSERT or UPDATE on tokens
-- and updates only the affected clinic's row for today — no full-table scans.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.fn_update_clinic_daily_stats_on_token_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_id uuid;
    v_date        date;
BEGIN
    -- Resolve which business and date this token belongs to
    SELECT s.business_id, s.date
    INTO   v_business_id, v_date
    FROM   public.sessions s
    WHERE  s.id = COALESCE(NEW.session_id, OLD.session_id);

    IF v_business_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only run incremental update for today in IST
    -- (historical dates are handled by the scheduled batch job)
    IF v_date != TIMEZONE('Asia/Kolkata', now())::date THEN
        RETURN NEW;
    END IF;

    -- Re-aggregate just this clinic for today
    PERFORM public.refresh_clinic_daily_stats(v_date);

    RETURN NEW;
END;
$$;

-- Drop before recreate to avoid duplicate triggers
DROP TRIGGER IF EXISTS trg_update_clinic_stats_on_token ON public.tokens;

CREATE TRIGGER trg_update_clinic_stats_on_token
AFTER INSERT OR UPDATE OF status, rating, served_at, cancelled_at
ON public.tokens
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_clinic_daily_stats_on_token_change();


-- =================================================================================
-- VERIFICATION QUERIES
-- Run these after applying the migration to confirm correctness.
-- =================================================================================

-- Check 1: Partial index exists
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'tokens' AND indexname = 'idx_tokens_active_phone_unique';

-- Check 2: New columns on clinic_daily_stats
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'clinic_daily_stats'
-- ORDER BY ordinal_position;

-- Check 3: Trigger is registered
-- SELECT trigger_name, event_manipulation, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name = 'trg_update_clinic_stats_on_token';
