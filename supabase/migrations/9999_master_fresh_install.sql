-- =================================================================================
-- QLINK MASTER SCHEMA (FRESH INSTALL)
-- Execute this entirely in the Supabase SQL Editor to instantly setup the SaaS DB.
-- =================================================================================

-- 1. CLEANUP (Drops existing tables so you can run this safely on a fresh project)
DROP TABLE IF EXISTS "public"."message_logs" CASCADE;
DROP TABLE IF EXISTS "public"."audit_logs" CASCADE;
DROP TABLE IF EXISTS "public"."tokens" CASCADE;
DROP TABLE IF EXISTS "public"."sessions" CASCADE;
DROP TABLE IF EXISTS "public"."staff_users" CASCADE;
DROP TABLE IF EXISTS "public"."businesses" CASCADE;

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

-- =================================================================================
-- 3. INDEXES FOR PERFORMANCE & REALTIME
-- =================================================================================

CREATE INDEX idx_tokens_session ON "public"."tokens" ("session_id");
CREATE INDEX idx_tokens_business_status ON "public"."tokens" ("business_id", "status");
CREATE INDEX idx_sessions_business_date ON "public"."sessions" ("business_id", "date");
CREATE INDEX idx_audit_logs_business_session ON "public"."audit_logs" ("business_id", "created_at");

-- =================================================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- =================================================================================

ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."staff_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."message_logs" ENABLE ROW LEVEL SECURITY;

-- Note: In a production App, you would write strict RLS policies tying `auth.uid()` to `staff_users.id`.
-- For MVP testing speed without a complex Auth UI, we allow ANONYMOUS READS for the public tracking links,
-- and rely on the Next.js Server Actions (using Service Role Key) to bypass RLS for writes.

CREATE POLICY "Allow public read access to businesses" ON "public"."businesses" FOR SELECT USING (true);
CREATE POLICY "Allow public read access to sessions" ON "public"."sessions" FOR SELECT USING (true);
CREATE POLICY "Allow public read access to tokens" ON "public"."tokens" FOR SELECT USING (true);

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
BEGIN
    -- 1. Lock the session row so no one else can modify it simultaneously.
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_business_id FOR UPDATE;

    -- 2. Increment the strictly sequential counter
    UPDATE public.sessions
    SET last_token_number = last_token_number + 1
    WHERE id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- 3. Insert the token safely using the new sequential number
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name, is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name, p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- 4. Append to Immutable Audit Log
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (p_business_id, p_staff_id, v_token_id, 'CREATED', jsonb_build_object('token_number', v_new_token_number, 'is_priority', p_is_priority));

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
        
        -- A. Revert the last Serving back to Waiting
        SELECT id, previous_status, token_number INTO v_target_token FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVING' ORDER BY created_at DESC LIMIT 1;
        
        IF v_target_token.id IS NOT NULL AND v_target_token.previous_status IS NOT NULL THEN
            UPDATE public.tokens SET status = v_target_token.previous_status WHERE id = v_target_token.id;
        END IF;

        -- B. Try to resurrect the last 'SERVED' back to 'SERVING'
        SELECT id, previous_status, token_number INTO v_target_token FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVED' ORDER BY served_at DESC LIMIT 1;

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
        UPDATE public.tokens SET status = COALESCE(previous_status, 'WAITING') WHERE session_id = p_session_id AND status = 'PAUSED';
        RETURN json_build_object('success', true);

    END IF;

    RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;
