-- ==========================================
-- Atomic Token Creation
-- Prevents race conditions and duplicate token numbers
-- ==========================================

CREATE OR REPLACE FUNCTION create_token_atomic(
    p_clinic_slug TEXT,
    p_phone TEXT,
    p_name TEXT,
    p_is_priority BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clinic_id UUID;
    v_clinic_name TEXT;
    v_session_id UUID;
    v_session_status TEXT;
    v_last_token INTEGER;
    v_last_emergency INTEGER;
    v_assigned_number INTEGER;
    v_new_token_id UUID;
    v_created_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    -- 1. Get Clinic
    SELECT id, name INTO v_clinic_id, v_clinic_name FROM clinics WHERE slug = p_clinic_slug;
    
    IF v_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Clinic not found');
    END IF;

    -- 2. Get/Create Session for Today (and LOCK it)
    -- We lock the session row to prevent concurrent updates to counters
    -- If no session exists, we create one.
    
    -- Try to find existing session
    SELECT id, status INTO v_session_id, v_session_status 
    FROM sessions 
    WHERE clinic_id = v_clinic_id AND date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    FOR UPDATE; -- LOCK ROW

    -- If no session, create one (and lock seemingly doesn't matter as it's new, but we need to handle concurrency here too)
    -- Simplification: If not found, insert. If insert fails (race), loop? 
    -- Better: Strict unique constraint on (clinic_id, date) and ON CONFLICT DO UPDATE... returning id.
    
    IF v_session_id IS NULL THEN
        INSERT INTO sessions (clinic_id, date, current_token_number, last_token_number, last_emergency_number, status)
        VALUES (v_clinic_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, 0, 0, 0, 'OPEN')
        ON CONFLICT (clinic_id, date) DO UPDATE SET updated_at = now() -- dummy update to return ID and lock
        RETURNING id, status INTO v_session_id, v_session_status;
    END IF;

    -- 3. Check Status
    IF v_session_status = 'CLOSED' THEN
        RETURN jsonb_build_object('error', 'Clinic is closed');
    END IF;
    IF v_session_status = 'PAUSED' THEN
        RETURN jsonb_build_object('error', 'Queue is currently paused');
    END IF;

    -- 4. Increment Counter (Counters are safe because we locked the session row)
    IF p_is_priority THEN
        UPDATE sessions 
        SET last_emergency_number = last_emergency_number + 1
        WHERE id = v_session_id
        RETURNING last_emergency_number INTO v_assigned_number;
    ELSE
        UPDATE sessions 
        SET last_token_number = last_token_number + 1
        WHERE id = v_session_id
        RETURNING last_token_number INTO v_assigned_number;
    END IF;

    -- 5. Insert Token
    INSERT INTO tokens (
        clinic_id, 
        session_id, 
        token_number, 
        customer_name, 
        customer_phone, 
        source, 
        status, 
        is_priority
    ) VALUES (
        v_clinic_id,
        v_session_id,
        v_assigned_number,
        COALESCE(p_name, 'Guest ' || v_assigned_number),
        p_phone,
        'QR',
        'WAITING',
        p_is_priority
    ) RETURNING id, created_at INTO v_new_token_id, v_created_at;

    -- 6. Return Result
    RETURN jsonb_build_object(
        'success', true,
        'token', jsonb_build_object(
            'id', v_new_token_id,
            'token_number', v_assigned_number,
            'is_priority', p_is_priority,
            'clinic_name', v_clinic_name
        )
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
