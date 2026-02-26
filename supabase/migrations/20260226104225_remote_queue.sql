-- =================================================================================
-- QLINK REMOTE QUEUE & BEHAVIORAL SHIFT MIGRATION
-- Adds strict source tracking, arrival validation, and ETA recalculation
-- =================================================================================

-- 1. SCHEMA ADDITIONS
ALTER TABLE "public"."tokens"
    ADD COLUMN "source" text DEFAULT 'QR_WALKIN', -- 'QR_WALKIN', 'WEB_LINK', 'DIRECT_WA'
    ADD COLUMN "is_arrived" boolean DEFAULT false,
    ADD COLUMN "arrived_at" timestamp with time zone,
    ADD COLUMN "grace_expires_at" timestamp with time zone;

ALTER TABLE "public"."clinic_daily_stats"
    ADD COLUMN "remote_join_count" integer DEFAULT 0,
    ADD COLUMN "walkin_join_count" integer DEFAULT 0,
    ADD COLUMN "remote_noshow_count" integer DEFAULT 0;

ALTER TABLE "public"."sessions"
    ADD COLUMN "avg_consult_seconds" integer DEFAULT 300; -- Default 5 mins

-- 2. UPDATE CREATE_TOKEN_ATOMIC RPC
-- Added `p_source` and properly inserts it.
CREATE OR REPLACE FUNCTION public.create_token_atomic(
    p_business_id uuid,
    p_session_id  uuid,
    p_phone       text,
    p_name        text,
    p_is_priority boolean DEFAULT false,
    p_staff_id    uuid    DEFAULT NULL,
    p_source      text    DEFAULT 'QR_WALKIN'
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
    v_is_arrived        boolean;
    v_arrived_at        timestamp with time zone;
    v_avg_consult_sec   int;
    v_tokens_ahead      int;
    v_ewt_seconds       int;
BEGIN
    -- 0. Compute IST date
    v_today_ist := TIMEZONE('Asia/Kolkata', now())::date;

    -- 1. Lock the session row FIRST (before any reads — this is critical)
    PERFORM id
    FROM public.sessions
    WHERE id          = p_session_id
      AND business_id = p_business_id
      AND date        = v_today_ist
      AND status      IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Session not found or already closed');
    END IF;

    -- 2. Read daily token limit
    SELECT daily_token_limit INTO v_limit
    FROM   public.businesses
    WHERE  id = p_business_id;

    -- 3. Enforce CAPACITY limit
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count
        FROM   public.tokens
        WHERE  session_id = p_session_id;

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

    -- 4. Block duplicate ACTIVE token
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT id, token_number, status INTO v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED', 'WAITING_LATE')
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
    RETURNING last_token_number, avg_consult_seconds INTO v_new_token_number, v_avg_consult_sec;

    -- 6. Remote Queue Logic: Only physical walkins are auto-arrived
    IF p_source = 'QR_WALKIN' THEN
        v_is_arrived := true;
        v_arrived_at := now();
    ELSE
        v_is_arrived := false;
        v_arrived_at := NULL;
    END IF;

    -- 7. Insert the new token
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name,
        is_priority, token_number, created_by_staff_id, source, is_arrived, arrived_at
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name,
        p_is_priority, v_new_token_number, p_staff_id, p_source, v_is_arrived, v_arrived_at
    ) RETURNING id INTO v_token_id;

    -- 8. Calculate ETA
    SELECT count(*) INTO v_tokens_ahead FROM public.tokens
    WHERE session_id = p_session_id AND status = 'WAITING';
    
    v_ewt_seconds := COALESCE(v_avg_consult_sec, 300) * v_tokens_ahead;

    -- 9. Immutable audit entry
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (
        p_business_id, p_staff_id, v_token_id, 'CREATED',
        json_build_object('token_number', v_new_token_number, 'is_priority', p_is_priority, 'source', p_source)::jsonb
    );

    RETURN json_build_object(
        'success',      true,
        'token_id',     v_token_id,
        'token_number', v_new_token_number,
        'ewt_seconds',  v_ewt_seconds
    );

EXCEPTION
    WHEN unique_violation THEN
        SELECT id, token_number, status INTO v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED', 'WAITING_LATE')
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


-- 3. UPDATE PROCESS_QUEUE_ACTION RPC (Adding Grace Timer Logic)
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
    v_next_is_arrived boolean;
    v_next_grace_expires timestamp with time zone;
    v_target_token RECORD;
    v_last_action RECORD;
BEGIN
    -- 1. Lock Session strictly
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_business_id FOR UPDATE;

    -- ===============================================================
    -- ACTION: NEXT
    -- ===============================================================
    IF p_action = 'NEXT' THEN
        -- Check if it's the receptionist returning to a token inside the grace period
        -- (Find if any token is already waiting_late and past grace period -> Auto-Skip them)
        UPDATE public.tokens 
        SET previous_status = status, status = 'SKIPPED'
        WHERE session_id = p_session_id AND status = 'WAITING_LATE' AND grace_expires_at < now();

        -- Mark current SERVING as SERVED
        SELECT id, token_number INTO v_current_serving_id, v_current_serving_number 
        FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVING' LIMIT 1;

        IF v_current_serving_id IS NOT NULL THEN
            UPDATE public.tokens SET previous_status = status, status = 'SERVED', served_at = now() WHERE id = v_current_serving_id;
            INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, v_current_serving_id, 'SERVED');
        END IF;

        -- Find the absolute strictest next WAITING token
        SELECT id, token_number, is_arrived, grace_expires_at INTO v_next_token_id, v_next_token_number, v_next_is_arrived, v_next_grace_expires
        FROM public.tokens
        WHERE session_id = p_session_id AND status IN ('WAITING', 'WAITING_LATE')
        ORDER BY is_priority DESC, token_number ASC
        LIMIT 1;

        IF v_next_token_id IS NULL THEN
             RETURN json_build_object('success', false, 'error', 'Queue is empty');
        END IF;

        -- The Ghost Patient Check (Lobby Decongestion)
        IF v_next_is_arrived = false THEN
            IF v_next_grace_expires IS NULL THEN
                 -- First time calling a ghost patient -> Set 2 minute grace period
                 UPDATE public.tokens 
                 SET status = 'WAITING_LATE', grace_expires_at = now() + interval '2 minutes' 
                 WHERE id = v_next_token_id;
                 
                 INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, v_next_token_id, 'GRACE_PERIOD_STARTED');
                 
                 RETURN json_build_object('success', true, 'action', 'GRACE_PERIOD', 'message', 'Patient not present. 2-minute arrival timer started.');
            ELSE
                 -- Receptionist clicked NEXT again, bypassing the ghost patient
                 UPDATE public.tokens SET previous_status = status, status = 'SKIPPED' WHERE id = v_next_token_id;
                 INSERT INTO public.audit_logs (business_id, staff_id, token_id, action) VALUES (p_business_id, p_staff_id, v_next_token_id, 'SKIPPED_LATE');
                 -- We explicitly recursively call to get the NEXT actual patient.
                 RETURN public.rpc_process_queue_action(p_business_id, p_session_id, p_staff_id, 'NEXT', NULL);
            END IF;
        END IF;

        -- Advance state (Normal)
        UPDATE public.tokens SET previous_status = status, status = 'SERVING', grace_expires_at = NULL WHERE id = v_next_token_id;
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
        UPDATE public.tokens SET previous_status = status, status = 'WAITING', is_priority = true, is_arrived = true, arrived_at = now(), grace_expires_at = NULL WHERE id = p_token_id;
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
    -- ACTION: UNDO
    -- ===============================================================
    ELSIF p_action = 'UNDO' THEN
        SELECT id, previous_status, token_number, served_at INTO v_target_token FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVED' 
        ORDER BY served_at DESC LIMIT 1;

        IF v_target_token.id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Nothing to undo.');
        END IF;

        IF extract(epoch from (now() - v_target_token.served_at)) > 300 THEN
            RETURN json_build_object('success', false, 'error', 'Undo expired. Can only undo actions from the last 5 minutes.');
        END IF;

        DECLARE
            v_current_waiting RECORD;
        BEGIN
            SELECT id, previous_status, token_number INTO v_current_waiting FROM public.tokens 
            WHERE session_id = p_session_id AND status = 'SERVING' ORDER BY created_at DESC LIMIT 1;
            
            IF v_current_waiting.id IS NOT NULL AND v_current_waiting.previous_status IS NOT NULL THEN
                UPDATE public.tokens SET status = v_current_waiting.previous_status WHERE id = v_current_waiting.id;
            END IF;
        END;

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
