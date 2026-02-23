-- =================================================================================
-- QLINK MASTER SCHEMA (FRESH INSTALL)
-- Execute this entirely in the Supabase SQL Editor to instantly setup the SaaS DB.
-- =================================================================================

-- 1. CLEANUP (Drops existing tables so you can run this safely on a fresh project)
DROP TABLE IF EXISTS "public"."consent_text_versions" CASCADE;
DROP TABLE IF EXISTS "public"."export_logs" CASCADE;
DROP TABLE IF EXISTS "public"."system_audit_logs" CASCADE;
DROP TABLE IF EXISTS "public"."patient_consent_logs" CASCADE;
DROP TABLE IF EXISTS "public"."clinic_daily_stats" CASCADE;
DROP TABLE IF EXISTS "public"."message_logs" CASCADE;
DROP TABLE IF EXISTS "public"."audit_logs" CASCADE;
DROP TABLE IF EXISTS "public"."tokens" CASCADE;
DROP TABLE IF EXISTS "public"."sessions" CASCADE;
DROP TABLE IF EXISTS "public"."staff_users" CASCADE;
DROP TABLE IF EXISTS "public"."businesses" CASCADE;

DROP FUNCTION IF EXISTS "public"."refresh_clinic_daily_stats" CASCADE;
DROP FUNCTION IF EXISTS "public"."rpc_process_queue_action" CASCADE;
DROP FUNCTION IF EXISTS "public"."create_token_atomic" CASCADE;
DROP FUNCTION IF EXISTS "public"."next_patient_atomic" CASCADE;

-- =================================================================================
-- 2. CREATE CORE TABLES
-- =================================================================================

CREATE TABLE "public"."businesses" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "slug" text NOT NULL,
    "name" text NOT NULL,
    "address" text,
    "contact_phone" text,
    "settings" jsonb DEFAULT '{}'::jsonb,
    "daily_token_limit" integer DEFAULT NULL,
    "retention_days" integer NOT NULL DEFAULT 30,
    "consent_text_version" text NOT NULL DEFAULT 'v1.0-2026-02-24',
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("slug")
);

CREATE TABLE "public"."staff_users" (
    "id" uuid NOT NULL, -- references auth.users
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "role" text NOT NULL DEFAULT 'RECEPTIONIST',
    "name" text NOT NULL,
    "phone" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."sessions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "date" date NOT NULL DEFAULT CURRENT_DATE,
    "status" text NOT NULL DEFAULT 'OPEN', -- OPEN, PAUSED, CLOSED
    "last_token_number" integer NOT NULL DEFAULT 0,
    "now_serving_number" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "closed_at" timestamp with time zone,
    PRIMARY KEY ("id"),
    UNIQUE ("business_id", "date", "status") -- Ensures one active session per day
);

CREATE TABLE "public"."tokens" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "session_id" uuid NOT NULL REFERENCES "public"."sessions"("id") ON DELETE CASCADE,
    "token_number" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'WAITING', -- WAITING, SERVING, SERVED, CANCELLED, SKIPPED, PAUSED
    "previous_status" text, -- Used for UNDO operations
    "is_priority" boolean DEFAULT false,
    "patient_name" text,
    "patient_phone" text,                  -- DEPRECATED: plaintext (backcompat only)
    "patient_phone_encrypted" text,         -- AES-256-GCM ciphertext (DPDP)
    "patient_phone_hash" text,              -- HMAC-SHA256 for dedup index (DPDP)
    "source" text DEFAULT 'QR',
    "rating" integer,
    "feedback" text,
    "created_by_staff_id" uuid,
    "offline_sync_id" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "served_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    PRIMARY KEY ("id"),
    UNIQUE ("session_id", "token_number")
);

CREATE TABLE "public"."patient_consent_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "phone_hash" text NOT NULL,
    "consent_text_version" text NOT NULL,
    "consent_given" boolean NOT NULL DEFAULT true,
    "source" text NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "session_id" uuid,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."export_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "staff_id" uuid,
    "export_type" text NOT NULL,
    "record_count" integer NOT NULL DEFAULT 0,
    "date_from" date,
    "date_to" date,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."system_audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid,
    "actor_id" uuid,
    "actor_role" text NOT NULL DEFAULT 'SYSTEM',
    "action_type" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" uuid,
    "metadata" jsonb NOT NULL DEFAULT '{}',
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."consent_text_versions" (
    "version" text NOT NULL,
    "text_content" text NOT NULL,
    "effective_at" timestamp with time zone NOT NULL DEFAULT now(),
    "created_by" text,
    PRIMARY KEY ("version")
);

INSERT INTO "public"."consent_text_versions" (version, text_content, created_by)
VALUES (
    'v1.0-2026-02-24',
    'I consent to QLink and the clinic processing my mobile number and first name solely for queue management and appointment communication, in accordance with the Digital Personal Data Protection Act 2023. My data will not be shared with third parties and will be deleted after 30 days.',
    'system'
) ON CONFLICT (version) DO NOTHING;

CREATE TABLE "public"."audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "staff_id" uuid,
    "token_id" uuid,
    "action" text NOT NULL, -- CREATED, CALLED, SERVED, CANCELLED, SKIPPED, UNDO
    "details" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."message_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "token_id" uuid REFERENCES "public"."tokens"("id") ON DELETE SET NULL,
    "message_type" text NOT NULL, -- WELCOME_LINK, REMINDER
    "provider" text NOT NULL DEFAULT 'WHATSAPP',
    "provider_response" jsonb,
    "status" text NOT NULL DEFAULT 'PENDING',
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE TABLE "public"."clinic_daily_stats" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "business_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "date" date NOT NULL,
    "total_tokens" integer NOT NULL DEFAULT 0,
    "served_count" integer NOT NULL DEFAULT 0,
    "skipped_count" integer NOT NULL DEFAULT 0,
    "cancelled_count" integer NOT NULL DEFAULT 0,
    "recall_count" integer NOT NULL DEFAULT 0,
    "emergency_count" integer NOT NULL DEFAULT 0,
    "active_tokens" integer NOT NULL DEFAULT 0,
    "whatsapp_count" integer NOT NULL DEFAULT 0,
    "sms_count" integer NOT NULL DEFAULT 0,
    "avg_wait_time_minutes" numeric NOT NULL DEFAULT 0,
    "avg_rating" numeric DEFAULT NULL,
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("business_id", "date")
);

-- =================================================================================
-- 3. INDEXES FOR PERFORMANCE & REALTIME
-- =================================================================================

CREATE INDEX idx_tokens_session ON "public"."tokens" ("session_id");
CREATE INDEX idx_tokens_business_status ON "public"."tokens" ("business_id", "status");
CREATE INDEX idx_sessions_business_date ON "public"."sessions" ("business_id", "date");
CREATE INDEX idx_audit_logs_business_session ON "public"."audit_logs" ("business_id", "created_at");
-- Index for fast analytics queries
CREATE INDEX "idx_clinic_daily_stats_date" ON "public"."clinic_daily_stats" ("date");
CREATE INDEX "idx_clinic_daily_stats_business" ON "public"."clinic_daily_stats" ("business_id");
-- Partial unique index: prevents duplicate ACTIVE tokens for the same phone in a session.
-- This is the database-level race-condition guard. The partial index only constrains
-- rows where the patient is still active; once served/cancelled the constraint lifts.
CREATE UNIQUE INDEX "idx_tokens_active_phone_unique"
    ON "public"."tokens" ("session_id", "patient_phone")
    WHERE status IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED');

-- =================================================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- =================================================================================

ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."staff_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."message_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clinic_daily_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."patient_consent_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."export_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."consent_text_versions" ENABLE ROW LEVEL SECURITY;

-- Immutability: system_audit_logs is append-only
REVOKE UPDATE, DELETE ON "public"."system_audit_logs" FROM PUBLIC;
REVOKE UPDATE, DELETE ON "public"."system_audit_logs" FROM authenticated;
REVOKE UPDATE, DELETE ON "public"."system_audit_logs" FROM anon;

-- Note: In a production App, you would write strict RLS policies tying `auth.uid()` to `staff_users.id`.
-- For MVP testing speed without a complex Auth UI, we allow ANONYMOUS READS for the public tracking links,
-- and rely on the Next.js Server Actions (using Service Role Key) to bypass RLS for writes.

CREATE POLICY "Allow public read access to businesses" ON "public"."businesses" FOR SELECT USING (true);
CREATE POLICY "Allow public read access to sessions" ON "public"."sessions" FOR SELECT USING (true);
CREATE POLICY "Allow public read access to tokens" ON "public"."tokens" FOR SELECT USING (true);
CREATE POLICY "Allow public read access to clinic_daily_stats" ON "public"."clinic_daily_stats" FOR SELECT USING (true);

-- ENABLE REALTIME FOR TOKENS & SESSIONS
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."tokens";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."sessions";

-- =================================================================================
-- 5. ATOMIC QUEUE FUNCTIONS (THE BRAINS OF QLINK)
-- =================================================================================

-- A. CREATE TOKEN ATOMICALLY (Prevents sequence collisions + enforces all limits)
-- FIXED: variable name bug, wrong count semantics, RECALLED in active states,
--        unique_violation EXCEPTION handler for partial-index race condition.
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
    v_limit             int;   -- daily_token_limit from businesses
    v_issued_count      int;   -- ALL tokens ever issued in session (capacity)
    v_today_ist         date;  -- IST date to prevent UTC/IST midnight split
BEGIN
    -- 0. Compute IST date
    v_today_ist := TIMEZONE('Asia/Kolkata', now())::date;

    -- 1. Lock the session row FIRST (before any reads — this is critical)
    --    Serializes all concurrent calls; no two callers pass step 2 simultaneously.
    PERFORM id
    FROM public.sessions
    WHERE id          = p_session_id
      AND business_id = p_business_id
      AND date        = v_today_ist
      AND status      IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Session not found or already closed'
        );
    END IF;

    -- 2. Read daily token limit
    SELECT daily_token_limit INTO v_limit
    FROM   public.businesses
    WHERE  id = p_business_id;

    -- 3. Enforce CAPACITY limit (FIX: count ALL tokens issued, not just active)
    --    daily_token_limit = total seats available today. Once 50 are issued,
    --    the 51st is refused even if 40 have already been served.
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count
        FROM   public.tokens
        WHERE  session_id = p_session_id;  -- no status filter

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

    -- 4. Block duplicate ACTIVE token for same phone (FIX: RECALLED now included)
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT id, token_number, status INTO v_existing_token
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

    -- 5. Atomically increment session counter
    UPDATE public.sessions
    SET    last_token_number = last_token_number + 1
    WHERE  id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- 6. Insert the new token
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name,
        is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name,
        p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- 7. Immutable audit entry
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (
        p_business_id, p_staff_id, v_token_id, 'CREATED',
        json_build_object('token_number', v_new_token_number, 'is_priority', p_is_priority)::jsonb
    );

    RETURN json_build_object(
        'success',      true,
        'token_id',     v_token_id,
        'token_number', v_new_token_number
    );

EXCEPTION
    -- Catch partial-index unique_violation (race condition: two simultaneous inserts
    -- for the same phone can both pass the IF check before either inserts).
    WHEN unique_violation THEN
        SELECT id, token_number, status INTO v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;

        RETURN json_build_object(
            'success',               false,
            'error',                 'You already have an active token in this session.',
            'is_duplicate',          true,
            'existing_token_id',     v_existing_token.id,
            'existing_token_number', v_existing_token.token_number,
            'existing_status',       v_existing_token.status
        );
END;
$$;


-- B. PROCESS QUEUE ACTION ATOMICALLY (Next, Skip, Cancel, Undo, etc.)
CREATE OR REPLACE FUNCTION public.rpc_process_queue_action(
    p_business_id uuid,
    p_session_id uuid,
    p_staff_id uuid,
    p_action text, -- 'NEXT', 'SKIP', 'CANCEL', 'RECALL', 'UNDO'
    p_token_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_serving_id uuid;
    v_current_serving_number int;
    v_next_token_id uuid;
    v_next_token_number int;
    v_target_token RECORD;
    v_last_action RECORD;
BEGIN
    -- 1. Lock Session strictly
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_business_id FOR UPDATE;

    -- ===============================================================
    -- ACTION: NEXT
    -- ===============================================================
    IF p_action = 'NEXT' THEN
        -- Mark current SERVING as SERVED
        SELECT id, token_number INTO v_current_serving_id, v_current_serving_number 
        FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVING' LIMIT 1;

        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.tokens SET previous_status = status, status = 'SERVED', served_at = now() WHERE id = v_current_serving_id;
            INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, v_current_serving_id, 'SERVED');
        END IF;

        -- Find the absolute strictest next WAITING token (Priorities first, then sequential)
        SELECT id, token_number INTO v_next_token_id, v_next_token_number
        FROM public.tokens
        WHERE session_id = p_session_id AND status = 'WAITING'
        ORDER BY is_priority DESC, token_number ASC
        LIMIT 1;

        IF v_next_token_id IS NULL THEN
             RETURN json_build_object('success', false, 'error', 'Queue is empty');
        END IF;

        -- Advance state
        UPDATE public.tokens SET previous_status = status, status = 'SERVING' WHERE id = v_next_token_id;
        UPDATE public.sessions SET now_serving_number = v_next_token_number WHERE id = p_session_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, v_next_token_id, 'CALLED');

        RETURN json_build_object('success', true, 'called_token_number', v_next_token_number);

    -- ===============================================================
    -- ACTION: SKIP
    -- ===============================================================
    ELSIF p_action = 'SKIP' AND p_token_id IS NOT NULL THEN
        UPDATE public.tokens SET previous_status = status, status = 'SKIPPED' WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, p_token_id, 'SKIPPED');
        RETURN json_build_object('success', true);

    -- ===============================================================
    -- ACTION: RECALL (Bring skipped back to front/serving)
    -- ===============================================================
    ELSIF p_action = 'RECALL' AND p_token_id IS NOT NULL THEN
        UPDATE public.tokens SET previous_status = status, status = 'WAITING', is_priority = true WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, p_token_id, 'RECALLED');
        RETURN json_build_object('success', true);

    -- ===============================================================
    -- ACTION: CANCEL
    -- ===============================================================
    ELSIF p_action = 'CANCEL' AND p_token_id IS NOT NULL THEN
        UPDATE public.tokens SET previous_status = status, status = 'CANCELLED', cancelled_at = now() WHERE id = p_token_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, p_token_id, 'CANCELLED');
        RETURN json_build_object('success', true);

    -- ===============================================================
    -- ACTION: UNDO (Safety feature for Receptionists)
    -- ===============================================================
    ELSIF p_action = 'UNDO' THEN
        -- Safely rollback the state by reading the last state transition
        -- (In a real massive app, you'd unroll the exact audit log, but relying on previous_status is perfect for MVP).
        
        -- INDIAN SMB CRASH FIX: The Infinite Undo Queue Fracture
        -- Only permit an undo if the token was SERVED in the last 5 minutes.
        -- This prevents a receptionist from panic-clicking Undo 50 times and reverting the entire day's operations.

        -- B. Try to resurrect the last 'SERVED' back to 'SERVING'
        SELECT id, previous_status, token_number, served_at INTO v_target_token FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVED' 
        ORDER BY served_at DESC LIMIT 1;

        -- Hard Time Boundary Check
        IF v_target_token.id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Nothing to undo.');
        END IF;

        IF extract(epoch from (now() - v_target_token.served_at)) > 300 THEN
            RETURN json_build_object('success', false, 'error', 'Undo expired. Can only undo actions from the last 5 minutes.');
        END IF;

        -- A. Revert the currently 'SERVING' token back to 'WAITING' to make room
        DECLARE
            v_current_waiting RECORD;
        BEGIN
            SELECT id, previous_status, token_number INTO v_current_waiting FROM public.tokens 
            WHERE session_id = p_session_id AND status = 'SERVING' ORDER BY created_at DESC LIMIT 1;
            
            IF v_current_waiting.id IS NOT NULL AND v_current_waiting.previous_status IS NOT NULL THEN
                UPDATE public.tokens SET status = v_current_waiting.previous_status WHERE id = v_current_waiting.id;
            END IF;
        END;

        -- Now actually resurrect the target back to SERVING
        IF v_target_token.id IS NOT NULL AND (v_target_token.previous_status = 'SERVING' OR v_target_token.previous_status IS NOT NULL) THEN
            UPDATE public.tokens SET status = 'SERVING', served_at = NULL WHERE id = v_target_token.id;
            UPDATE public.sessions SET now_serving_number = v_target_token.token_number WHERE id = p_session_id;
        END IF;

        INSERT INTO public.audit_logs (business_id, staff_id, action) VALUES (p_business_id, p_staff_id, 'UNDO_EXECUTED');
        RETURN json_build_object('success', true, 'message', 'Undo completed successfully');

    -- ===============================================================
    -- ACTION: PAUSE_SESSION / RESUME_SESSION
    -- ===============================================================
    ELSIF p_action = 'PAUSE_SESSION' THEN
        UPDATE public.sessions SET status = 'PAUSED' WHERE id = p_session_id;
        -- Optional: Push all WAITERS to PAUSED status so the frontend automatically updates tickets
        UPDATE public.tokens SET previous_status = status, status = 'PAUSED' WHERE session_id = p_session_id AND status = 'WAITING';
        RETURN json_build_object('success', true);

    ELSIF p_action = 'RESUME_SESSION' THEN
        UPDATE public.sessions SET status = 'OPEN' WHERE id = p_session_id;
        INSERT INTO public.audit_logs (business_id, staff_id, action) VALUES (p_business_id, p_staff_id, 'SESSION_RESUMED');
        RETURN json_build_object('success', true);

    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid action');
    END IF;

END;
$$;


-- =================================================================================
-- 6. ANALYTICS PRE-COMPUTATION RPC (UPDATED: includes new columns)
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

        COALESCE(COUNT(t.id), 0)                                                                       AS total_tokens,
        COALESCE(SUM(CASE WHEN t.status = 'SERVED'    THEN 1 ELSE 0 END), 0)                          AS served_count,
        COALESCE(SUM(CASE WHEN t.status = 'SKIPPED'   THEN 1 ELSE 0 END), 0)                          AS skipped_count,
        COALESCE(SUM(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END), 0)                          AS cancelled_count,

        -- Recall count from audit_logs (action name is 'RECALLED' in rpc_process_queue_action)
        (SELECT COUNT(*) FROM public.audit_logs al
         WHERE al.business_id = b.id AND al.action = 'RECALLED'
           AND (al.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date)                            AS recall_count,

        COALESCE(SUM(CASE WHEN t.is_priority = true THEN 1 ELSE 0 END), 0)                            AS emergency_count,
        COALESCE(SUM(CASE WHEN t.status IN ('WAITING','SERVING','SKIPPED','RECALLED','PAUSED')
                          THEN 1 ELSE 0 END), 0)                                                       AS active_tokens,

        -- Average wait time (served tokens only)
        COALESCE(ROUND(EXTRACT(EPOCH FROM AVG(
            CASE WHEN t.status = 'SERVED' AND t.served_at IS NOT NULL
                 THEN (t.served_at - t.created_at) ELSE NULL END
        )) / 60), 0)                                                                                   AS avg_wait_time_minutes,

        -- Average rating (NULL if no ratings exist)
        CASE WHEN COUNT(t.rating) > 0 THEN ROUND(AVG(t.rating), 2) ELSE NULL END                     AS avg_rating,

        (SELECT COUNT(*) FROM public.message_logs ml
         WHERE ml.business_id = b.id AND ml.provider = 'WHATSAPP'
           AND (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date)                            AS whatsapp_count,
        0                                                                                              AS sms_count,
        now()                                                                                          AS updated_at

    FROM public.businesses b
    LEFT JOIN public.sessions s ON s.business_id = b.id AND s.date = p_date
    LEFT JOIN public.tokens   t ON t.session_id  = s.id
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
-- 7. LIVE-UPDATE TRIGGER ON TOKENS → clinic_daily_stats
-- Incrementally refreshes today's stats row on every token insert/update.
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
    SELECT s.business_id, s.date
    INTO   v_business_id, v_date
    FROM   public.sessions s
    WHERE  s.id = COALESCE(NEW.session_id, OLD.session_id);

    IF v_business_id IS NULL THEN RETURN NEW; END IF;
    IF v_date != TIMEZONE('Asia/Kolkata', now())::date THEN RETURN NEW; END IF;

    PERFORM public.refresh_clinic_daily_stats(v_date);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_clinic_stats_on_token ON public.tokens;
CREATE TRIGGER trg_update_clinic_stats_on_token
AFTER INSERT OR UPDATE OF status, rating, served_at, cancelled_at
ON public.tokens
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_clinic_daily_stats_on_token_change();
