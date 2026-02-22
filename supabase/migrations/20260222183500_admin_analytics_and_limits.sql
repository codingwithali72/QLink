-- Migration: Admin Analytics and Daily Token Limits
-- Description: Adds 'daily_token_limit' to businesses, upgrades 'create_token_atomic' to enforce it safely using Row-Level Locks, and creates the 'clinic_daily_stats' aggregation table for the Super Admin panel.

-- =================================================================================
-- 1. ADD DAILY TOKEN LIMIT TO BUSINESSES
-- =================================================================================
ALTER TABLE public.businesses ADD COLUMN daily_token_limit integer DEFAULT NULL;

-- =================================================================================
-- 2. CREATE CLINIC DAILY STATS TABLE (For Admin Analytics)
-- =================================================================================
CREATE TABLE public.clinic_daily_stats (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    total_tokens integer NOT NULL DEFAULT 0,
    served_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    recall_count integer NOT NULL DEFAULT 0,
    emergency_count integer NOT NULL DEFAULT 0,
    whatsapp_count integer NOT NULL DEFAULT 0,
    sms_count integer NOT NULL DEFAULT 0,
    avg_wait_time_minutes numeric NOT NULL DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (business_id, date) -- One aggregate row per clinic per day
);

-- Index for fast analytics queries
CREATE INDEX idx_clinic_daily_stats_date ON public.clinic_daily_stats (date);
CREATE INDEX idx_clinic_daily_stats_business ON public.clinic_daily_stats (business_id);

-- Enable RLS
ALTER TABLE public.clinic_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to clinic_daily_stats" ON public.clinic_daily_stats FOR SELECT USING (true);


-- =================================================================================
-- 3. UPGRADE CREATE_TOKEN_ATOMIC COMPLIANCE
-- =================================================================================
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
    v_business_limit int;
    v_active_token_count int;
BEGIN
    -- 1. Lock the session row so no one else can modify it simultaneously. (Concurrency Protection)
    PERFORM id FROM public.sessions WHERE id = p_session_id AND business_id = p_business_id FOR UPDATE;

    -- 2. Retrieve Daily Token Limit
    SELECT daily_token_limit INTO v_business_limit 
    FROM public.businesses 
    WHERE id = p_business_id;

    -- 3. Block creation if Daily Limit is reached (Strict Enforcement)
    IF v_business_limit IS NOT NULL AND v_business_limit > 0 THEN
        -- Count only active (non-served, non-cancelled) tokens for this session
        SELECT COUNT(id) INTO v_active_token_count
        FROM public.tokens
        WHERE session_id = p_session_id
          AND status NOT IN ('SERVED', 'CANCELLED');
          
        IF v_active_token_count >= v_business_limit THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Daily token limit reached',
                'limit_reached', true,
                'limit', v_business_limit,
                'count', v_active_token_count
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


-- =================================================================================
-- 4. ANALYTICS PRE-COMPUTATION RPC
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
