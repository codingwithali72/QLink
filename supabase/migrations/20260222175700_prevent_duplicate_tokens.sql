-- Migration: Ensure duplicate prevention and manual call audit
-- 1. Modify atomic token creation to prevent duplicates

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
BEGIN
    -- 1. Lock the session row so no one else can modify it simultaneously.
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_business_id FOR UPDATE;

    -- 2. Check for existing ACTIVE token for this phone number in this session
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT id, token_number, status INTO v_existing_token
        FROM public.tokens
        WHERE session_id = p_session_id 
          AND patient_phone = p_phone
          AND status IN ('WAITING', 'SERVING', 'SKIPPED', 'PAUSED')
        LIMIT 1;

        IF FOUND THEN
            -- Return duplicate flag with existing token details
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

    -- 3. Increment the strictly sequential counter
    UPDATE public.sessions
    SET last_token_number = last_token_number + 1
    WHERE id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- 4. Insert the token safely using the new sequential number
    INSERT INTO public.tokens (
        business_id, session_id, patient_phone, patient_name, is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id, p_phone, p_name, p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- 5. Append to Immutable Audit Log
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
