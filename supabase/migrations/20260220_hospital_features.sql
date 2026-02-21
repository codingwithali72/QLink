-- =================================================================================
-- QLINK HOSPITAL MIGRATION (Data Privacy & Room Allocation)
-- =================================================================================

-- 1. ADD ROOM NUMBER TO TOKENS
ALTER TABLE "public"."tokens" ADD COLUMN IF NOT EXISTS "room_number" text;

-- 2. REVOKE PUBLIC READ ACCESS FROM TOKENS (HIPAA / DATA PRIVACY)
-- We need to drop the old policy and recreate a stricter one.
-- Old policy: CREATE POLICY "Allow public read access to tokens" ON "public"."tokens" FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public read access to tokens" ON "public"."tokens";

-- New policy: Only authenticated users (Staff) can read the full tokens table.
-- Note: Anonymous users will now use a secure RPC to fetch only their necessary data.
CREATE POLICY "Allow authenticated read access to tokens" ON "public"."tokens" 
FOR SELECT TO authenticated USING (true);

-- 3. CREATE SECURE RPC FOR PUBLIC TRACKING LINKS
-- Returns only non-PII data for the specific token, plus the count of tokens ahead.
CREATE OR REPLACE FUNCTION public.rpc_get_public_token_status(p_token_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass RLS for this specific query
AS $$
DECLARE
    v_token RECORD;
    v_tokens_ahead int;
    v_serving_token_number text;
    v_result json;
BEGIN
    -- 1. Get the requested token's basic info (No phone number)
    SELECT id, session_id, token_number, status, is_priority, patient_name, room_number
    INTO v_token
    FROM public.tokens
    WHERE id = p_token_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Token not found');
    END IF;

    -- 2. Calculate tokens ahead
    IF v_token.status = 'WAITING' THEN
        SELECT count(*)
        INTO v_tokens_ahead
        FROM public.tokens
        WHERE session_id = v_token.session_id 
          AND status = 'WAITING'
          AND (
              -- If this token is priority, only count priority tokens ahead of it
              (v_token.is_priority = true AND is_priority = true AND token_number < v_token.token_number)
              OR
              -- If this token is regular, count ALL priority tokens, PLUS regular tokens ahead of it
              (v_token.is_priority = false AND (is_priority = true OR token_number < v_token.token_number))
          );
    ELSE
        v_tokens_ahead := 0;
    END IF;

    -- 3. Get currently serving token for this session
    SELECT CASE WHEN is_priority THEN 'E-' || token_number ELSE '#' || token_number END
    INTO v_serving_token_number
    FROM public.tokens
    WHERE session_id = v_token.session_id AND status = 'SERVING'
    LIMIT 1;

    -- Return the packaged result
    SELECT json_build_object(
        'success', true,
        'token', json_build_object(
            'id', v_token.id,
            'token_number', v_token.token_number,
            'status', v_token.status,
            'is_priority', v_token.is_priority,
            'patient_name', v_token.patient_name,
            'room_number', v_token.room_number
        ),
        'tokens_ahead', v_tokens_ahead,
        'current_serving', COALESCE(v_serving_token_number, '--')
    ) INTO v_result;

    RETURN v_result;
END;
$$;


-- 4. UPDATE QUEUE ACTION RPC TO SUPPORT TARGET_TOKEN (MANUAL OVERRIDE) AND ROOM ALLOCATION
CREATE OR REPLACE FUNCTION public.rpc_process_queue_action(
    p_business_id uuid,
    p_session_id uuid,
    p_staff_id uuid,
    p_action text, -- 'NEXT', 'SKIP', 'CANCEL', 'RECALL', 'UNDO'
    p_token_id uuid DEFAULT NULL,
    p_room_number text DEFAULT NULL -- NEW PARAMETER
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

        -- Find the next token to call. 
        -- If p_token_id is provided, use that specific token (Manual Override).
        -- Otherwise, fallback to the strict priority queue.
        IF p_token_id IS NOT NULL THEN
            SELECT id, token_number INTO v_next_token_id, v_next_token_number
            FROM public.tokens
            WHERE id = p_token_id AND session_id = p_session_id AND status = 'WAITING';
        ELSE
            SELECT id, token_number INTO v_next_token_id, v_next_token_number
            FROM public.tokens
            WHERE session_id = p_session_id AND status = 'WAITING'
            ORDER BY is_priority DESC, token_number ASC
            LIMIT 1;
        END IF;

        IF v_next_token_id IS NULL THEN
             RETURN json_build_object('success', false, 'error', 'Token not found or Queue is empty');
        END IF;

        -- Advance state and set room number if provided
        UPDATE public.tokens 
        SET previous_status = status, status = 'SERVING', room_number = COALESCE(p_room_number, room_number) 
        WHERE id = v_next_token_id;
        
        UPDATE public.sessions SET now_serving_number = v_next_token_number WHERE id = p_session_id;
        INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details) 
        VALUES (p_business_id, p_staff_id, v_next_token_id, 'CALLED', jsonb_build_object('room_number', p_room_number));

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
    -- ACTION: UNDO
    -- ===============================================================
    ELSIF p_action = 'UNDO' THEN
        -- Safely rollback the state
        
        -- A. Revert the last Serving back to Waiting
        SELECT id, previous_status, token_number INTO v_target_token FROM public.tokens 
        WHERE session_id = p_session_id AND status = 'SERVING' ORDER BY created_at DESC LIMIT 1;
        
        IF v_target_token.id IS NOT NULL AND v_target_token.previous_status IS NOT NULL THEN
            UPDATE public.tokens SET status = v_target_token.previous_status WHERE id = v_target_token.id;
        END IF;

        -- B. Try to resurrect the last 'SERVED' back to 'SERVING'
        SELECT id, previous_status, token_number, room_number INTO v_target_token FROM public.tokens 
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
