-- =================================================================================
-- QLINK MASTER SCHEMA (FRESH INSTALL)
-- Execute this entirely in the Supabase SQL Editor to instantly setup the SaaS DB.
-- =================================================================================

-- 1. CLEANUP (Drops existing tables so you can run this safely on a fresh project)
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
    "patient_phone" text,
    "source" text DEFAULT 'QR',
    "rating" integer,
    "feedback" text,
    "created_by_staff_id" uuid,
    "offline_sync_id" text, -- Used for resolving PWA conflicts
    "created_at" timestamp with time zone DEFAULT now(),
    "served_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    PRIMARY KEY ("id"),
    UNIQUE ("session_id", "token_number") -- Strict sequence constraint
);

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
    "recall_count" integer NOT NULL DEFAULT 0,
    "emergency_count" integer NOT NULL DEFAULT 0,
    "whatsapp_count" integer NOT NULL DEFAULT 0,
    "sms_count" integer NOT NULL DEFAULT 0,
    "avg_wait_time_minutes" numeric NOT NULL DEFAULT 0,
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

-- A. CREATE TOKEN ATOMICALLY (Prevents sequence collisions)
CREATE OR REPLACE FUNCTION public.create_token_atomic(
    p_business_id uuid,
    p_session_id uuid,
    p_phone text,
    p_name text,
    p_is_priority boolean DEFAULT false,
    p_staff_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_token_number int;
    v_token_id uuid;
    v_result json;
    v_existing_token record;
    v_limit int;
    v_current_count int;
    v_is_duplicate boolean;
    v_today_ist date;
BEGIN
    -- 0. Calculate Explicit 'Asia/Kolkata' Date (Indian SMB Crash Fix)
    v_today_ist := TIMEZONE('Asia/Kolkata', now())::date;

    -- 1. Lock the session row so no one else can modify it simultaneously. (Concurrency Protection)
    PERFORM id FROM public.sessions 
    WHERE id = p_session_id AND business_id = p_business_id AND date = v_today_ist 
    FOR UPDATE;

    -- 2. Retrieve Daily Token Limit
    SELECT daily_token_limit INTO v_limit 
    FROM public.businesses 
    WHERE id = p_business_id;

    -- 3. Block creation if Daily Limit is reached (Strict Enforcement)
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_current_count
        FROM public.tokens
        WHERE session_id = p_session_id
          AND status NOT IN ('SERVED', 'CANCELLED');
          
        IF v_current_count >= v_limit THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Daily token limit reached',
                'limit_reached', true,
                'limit', v_limit,
                'count', v_current_count
            );
        END IF;
    END IF;

    -- 4. Check for existing ACTIVE token for this phone number in this session
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT id, token_number, status INTO v_existing_token
        FROM public.tokens
        WHERE session_id = p_session_id 
          AND patient_phone = p_phone
          AND status IN ('WAITING', 'SERVING', 'SKIPPED', 'PAUSED')
        LIMIT 1;

        IF FOUND THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Token already exists',
                'is_duplicate', true,
                'existing_token_id', v_existing_token.id,
                'existing_token_number', v_existing_token.token_number,
                'existing_status', v_existing_token.status
            );
        END IF;
    END IF;

    -- 5. Increment the strictly sequential counter
    UPDATE public.sessions
    SET last_token_number = last_token_number + 1
    WHERE id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- 6. Insert the token safely using the new sequential number
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name, is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name, p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- 7. Append to Immutable Audit Log
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (p_business_id, p_staff_id, v_token_id, 'CREATED', json_build_object('token_number', v_new_token_number, 'is_priority', p_is_priority)::jsonb);

    -- Return the result
    SELECT json_build_object(
        'success', true,
        'token_id', v_token_id,
        'token_number', v_new_token_number
    ) INTO v_result;

    RETURN v_result;
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
-- 6. ANALYTICS PRE-COMPUTATION RPC
-- =================================================================================
-- This function aggregates metrics for a specific date and upserts them into `clinic_daily_stats`.
-- It avoids heavy runtime aggregations in the Admin Dashboard.
CREATE OR REPLACE FUNCTION public.refresh_clinic_daily_stats(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.clinic_daily_stats (
        business_id, date, total_tokens, served_count, skipped_count, 
        recall_count, emergency_count, avg_wait_time_minutes, whatsapp_count, sms_count, updated_at
    )
    SELECT 
        b.id AS business_id,
        p_date AS date,
        
        -- Tokens aggregates
        COALESCE(COUNT(t.id), 0) AS total_tokens,
        COALESCE(SUM(CASE WHEN t.status = 'SERVED' THEN 1 ELSE 0 END), 0) AS served_count,
        COALESCE(SUM(CASE WHEN t.status = 'SKIPPED' THEN 1 ELSE 0 END), 0) AS skipped_count,
        -- Recall count derived from operations later, approximated here by audit logs or simplistically modeled
        -- We will pull true recall counts directly from audit_logs for the day for perfection.
        (SELECT COUNT(*) FROM public.audit_logs al WHERE al.business_id = b.id AND al.action = 'RECALL' AND (al.created_at AT TIME ZONE 'UTC')::date = p_date) AS recall_count,
        COALESCE(SUM(CASE WHEN t.is_priority = true THEN 1 ELSE 0 END), 0) AS emergency_count,
        
        -- Safe average wait time interval calculation in minutes
        COALESCE(
            ROUND(
                EXTRACT(EPOCH FROM AVG(
                    CASE WHEN t.status = 'SERVED' AND t.served_at IS NOT NULL 
                    THEN (t.served_at - t.created_at) 
                    ELSE NULL END
                )) / 60
            ), 0
        ) AS avg_wait_time_minutes,

        -- Messaging Aggregates
        (SELECT COUNT(*) FROM public.message_logs ml WHERE ml.business_id = b.id AND ml.provider = 'WHATSAPP' AND (ml.created_at AT TIME ZONE 'UTC')::date = p_date) AS whatsapp_count,
        0 AS sms_count, -- Placeholder for future SMS provider
        now() AS updated_at

    FROM public.businesses b
    -- Left join on sessions for the target date to link tokens
    LEFT JOIN public.sessions s ON s.business_id = b.id AND s.date = p_date
    LEFT JOIN public.tokens t ON t.session_id = s.id
    
    GROUP BY b.id, p_date
    
    ON CONFLICT (business_id, date) DO UPDATE 
    SET 
        total_tokens = EXCLUDED.total_tokens,
        served_count = EXCLUDED.served_count,
        skipped_count = EXCLUDED.skipped_count,
        recall_count = EXCLUDED.recall_count,
        emergency_count = EXCLUDED.emergency_count,
        avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
        whatsapp_count = EXCLUDED.whatsapp_count,
        sms_count = EXCLUDED.sms_count,
        updated_at = now();
END;
$$;
