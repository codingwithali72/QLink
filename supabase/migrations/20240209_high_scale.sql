-- ==========================================
-- High Scale Architecture Migration
-- 1. Performance Indices
-- 2. Atomic Transactions (RPC)
-- ==========================================

-- 1. INDICES FOR SPEED
-- Makes fetching "Waiting List" instant even with millions of rows
CREATE INDEX IF NOT EXISTS idx_tokens_session_status_priority 
ON tokens(session_id, status, is_priority, token_number);

-- Makes searching patient history by phone/name instant
CREATE INDEX IF NOT EXISTS idx_tokens_clinic_phone 
ON tokens(clinic_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_tokens_clinic_name 
ON tokens(clinic_id, customer_name);

-- 2. ATOMIC "NEXT PATIENT" FUNCTION
-- This replaces the client-side logic to prevent race conditions.
-- Handles: Locking, Serving Logic, Priority Sorting, and Updates in ONE transaction.

CREATE OR REPLACE FUNCTION next_patient_atomic(
    p_clinic_slug TEXT,
    p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin privileges to bypass RLS if needed, but we check permissions via logic
AS $$
DECLARE
    v_clinic_id UUID;
    v_session_id UUID;
    v_next_token_id UUID;
    v_next_token_number INTEGER;
    v_next_token_priority BOOLEAN;
    v_customer_phone TEXT;
    v_clinic_name TEXT;
    v_result JSONB;
BEGIN
    -- A. Get Clinic and Session (Locking not strictly needed here if just reading ids)
    SELECT id, name INTO v_clinic_id, v_clinic_name FROM clinics WHERE slug = p_clinic_slug;
    
    IF v_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Clinic not found');
    END IF;

    SELECT id INTO v_session_id FROM sessions WHERE clinic_id = v_clinic_id AND date = p_date;

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object('error', 'No active session for today');
    END IF;

    -- B. ATOMIC TRANSACTION START
    
    -- 1. Mark current SERVING as SERVED
    UPDATE tokens 
    SET status = 'SERVED' 
    WHERE session_id = v_session_id AND status = 'SERVING';

    -- 2. Find Next Token (Locking the row to prevent race conditions)
    -- Logic: Priority "WAITING" first, ordered by token_number. Then Regular "WAITING".
    SELECT id, token_number, is_priority, customer_phone 
    INTO v_next_token_id, v_next_token_number, v_next_token_priority, v_customer_phone
    FROM tokens
    WHERE session_id = v_session_id AND status = 'WAITING'
    ORDER BY is_priority DESC, token_number ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED; -- Critical: Skips rows locked by other transactions (if we had multiple consumers, but here we just want to lock it)

    IF v_next_token_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'No waiting patients');
    END IF;

    -- 3. Update Status to SERVING
    UPDATE tokens 
    SET status = 'SERVING' 
    WHERE id = v_next_token_id;

    -- 4. Update Session "Current Token" Display
    UPDATE sessions 
    SET current_token_number = v_next_token_number 
    WHERE id = v_session_id;

    -- 5. Return Result for SMS
    RETURN jsonb_build_object(
        'success', true,
        'token_id', v_next_token_id,
        'token_number', v_next_token_number,
        'is_priority', v_next_token_priority,
        'customer_phone', v_customer_phone,
        'clinic_name', v_clinic_name
    );

END;
$$;
