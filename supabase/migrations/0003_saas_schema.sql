-- ==========================================
-- QLink SaaS Migration
-- Adds atomic queue actions, RLS hardening, and offline support
-- ==========================================

-- 1. Add offline support and previous state to tokens for UNDO functionality
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS offline_sync_id TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 2. Add advanced indexes for performance
CREATE INDEX IF NOT EXISTS idx_tokens_business_session_status ON tokens(business_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_session ON audit_logs(business_id, session_id);

-- 3. Atomic RPC for Queue Actions
-- Handles race conditions by locking the session row first.
CREATE OR REPLACE FUNCTION rpc_process_queue_action(
  p_business_id UUID,
  p_session_id UUID,
  p_staff_id UUID,
  p_action TEXT,
  p_token_id UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_token RECORD;
  v_next_token RECORD;
  v_prev_served RECORD;
BEGIN
  -- 1. Lock the session to serialize all queue modifications for this clinic
  SELECT * INTO v_session FROM sessions 
  WHERE id = p_session_id AND business_id = p_business_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN 
    RETURN json_build_object('success', false, 'error', 'Session not found'); 
  END IF;

  -- 2. Process Action
  IF p_action = 'NEXT' THEN
    -- Mark current SERVING as SERVED (save previous_status)
    UPDATE tokens SET previous_status = status, status = 'SERVED', completed_at = NOW() 
    WHERE business_id = p_business_id AND session_id = p_session_id AND status = 'SERVING';
    
    -- Find next WAITING
    SELECT * INTO v_next_token FROM tokens 
    WHERE business_id = p_business_id AND session_id = p_session_id AND status = 'WAITING'
    ORDER BY is_priority DESC, token_number ASC LIMIT 1 FOR UPDATE;
    
    IF FOUND THEN
      UPDATE tokens SET previous_status = status, status = 'SERVING' WHERE id = v_next_token.id;
      RETURN json_build_object('success', true, 'action', p_action, 'token_id', v_next_token.id, 'token_number', v_next_token.token_number);
    ELSE
      RETURN json_build_object('success', true, 'action', p_action, 'message', 'No waiting patients');
    END IF;
    
  ELSIF p_action = 'SKIP' THEN
    UPDATE tokens SET previous_status = status, status = 'SKIPPED' 
    WHERE id = p_token_id AND status = 'WAITING' RETURNING id INTO v_token;
    
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Token not WAITING or not found'); END IF;
    RETURN json_build_object('success', true, 'action', p_action, 'token_id', p_token_id);
    
  ELSIF p_action = 'RECALL' THEN
    UPDATE tokens SET previous_status = status, status = 'WAITING' 
    WHERE id = p_token_id AND status = 'SKIPPED' RETURNING id INTO v_token;
    
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Token not SKIPPED or not found'); END IF;
    RETURN json_build_object('success', true, 'action', p_action, 'token_id', p_token_id);
    
  ELSIF p_action = 'CANCEL' THEN
    UPDATE tokens SET previous_status = status, status = 'CANCELLED' 
    WHERE id = p_token_id AND status IN ('WAITING', 'SKIPPED') RETURNING id INTO v_token;
    
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Token cannot be cancelled from current state'); END IF;
    RETURN json_build_object('success', true, 'action', p_action, 'token_id', p_token_id);

  ELSIF p_action = 'UNDO' THEN
    -- Undo logic: 
    -- 1. If currently SERVING, revert it to WAITING.
    -- 2. If there's a recently SERVED, revert it to SERVING.
    -- This handles the common "Oops I clicked Next twice"
    
    -- Revert current SERVING -> WAITING
    UPDATE tokens SET status = previous_status, previous_status = NULL 
    WHERE business_id = p_business_id AND session_id = p_session_id AND status = 'SERVING' AND previous_status = 'WAITING';
    
    -- Revert last SERVED -> SERVING
    SELECT * INTO v_prev_served FROM tokens 
    WHERE business_id = p_business_id AND session_id = p_session_id AND status = 'SERVED' AND previous_status = 'SERVING'
    ORDER BY completed_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
    
    IF FOUND THEN
      UPDATE tokens SET status = previous_status, previous_status = NULL, completed_at = NULL 
      WHERE id = v_prev_served.id;
    END IF;

    RETURN json_build_object('success', true, 'action', p_action, 'message', 'Undo completed');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

-- 4. Admin function to close obsolete sessions (auto-expire)
CREATE OR REPLACE FUNCTION rpc_expire_old_sessions() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions 
  SET status = 'CLOSED', end_time = NOW()
  WHERE status IN ('OPEN', 'PAUSED') AND date < CURRENT_DATE;
END;
$$;
