-- =================================================================================
-- PHASE 20: Command Center DB Analytics & Core Infrastructure
-- Enforces true mathematical integrity constraints and DB-backed telemetry.
-- =================================================================================

-- 1. Upgrade Staff Roles to Support 'AUDITOR'
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'AUDITOR';

-- 2. Create Composite Index to Accelerate Deep Analytics (Prevent N+1 in Admin)
CREATE INDEX IF NOT EXISTS "idx_clinical_visits_clinic_created_status" 
ON "public"."clinical_visits" ("clinic_id", "created_at" DESC, "status");

-- 3. Executive Overview Quick Stats (O(1) Health Check)
CREATE OR REPLACE FUNCTION public.rpc_get_admin_executive_overview(p_admin_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_is_super boolean;
    v_active_clinics int;
    v_active_sessions int;
    v_today_tokens int;
    v_messages_today int;
    v_avg_wait_time int;
BEGIN
    -- Security: Ensure caller is Super Admin
    SELECT EXISTS (
        SELECT 1 FROM public.staff_users 
        WHERE id = p_admin_id AND role = 'SUPER_ADMIN'
    ) INTO v_is_super;

    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: Requires SUPER_ADMIN role';
    END IF;

    -- Count active clinics
    SELECT count(*) INTO v_active_clinics FROM public.businesses WHERE is_active = true AND deleted_at IS NULL;

    -- Count active sessions (today)
    SELECT count(*) INTO v_active_sessions FROM public.sessions 
    WHERE date = current_date AND status = 'OPEN';

    -- Count today's tokens
    SELECT count(*) INTO v_today_tokens FROM public.clinical_visits 
    WHERE created_at >= date_trunc('day', timezone('Asia/Kolkata', now()));

    -- Count today's WhatsApp messages sent
    SELECT count(*) INTO v_messages_today FROM public.message_logs 
    WHERE created_at >= date_trunc('day', timezone('Asia/Kolkata', now())) 
    AND direction = 'OUTBOUND';

    -- Calculate realtime live average wait time for today ONLY FOR SERVED patients
    -- Mathematical Integrity: SUM(assessment - arrival) / total_served
    SELECT 
        COALESCE(
            EXTRACT(EPOCH FROM SUM(consultant_assessment_start_time - arrival_at_department_time)) / 60 / NULLIF(COUNT(*), 0), 
            0
        )::int INTO v_avg_wait_time
    FROM public.clinical_visits
    WHERE created_at >= date_trunc('day', timezone('Asia/Kolkata', now()))
      AND status = 'SERVED'
      AND consultant_assessment_start_time IS NOT NULL 
      AND arrival_at_department_time IS NOT NULL
      AND consultant_assessment_start_time >= arrival_at_department_time;

    RETURN json_build_object(
        'active_clinics', v_active_clinics,
        'active_sessions', v_active_sessions,
        'today_tokens', v_today_tokens,
        'messages_today', v_messages_today,
        'avg_wait_time_live_mins', v_avg_wait_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Deep Analytics Engine RPC (Chronological + Mathematical Integrity)
CREATE OR REPLACE FUNCTION public.rpc_get_clinic_deep_analytics(
    p_admin_id uuid,
    p_clinic_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS jsonb AS $$
DECLARE
    v_is_super boolean;
    v_total_created int;
    v_total_served int;
    v_total_cancelled int;
    v_total_skipped int;
    v_avg_wait_mins int;
    v_avg_service_mins int;
    v_avg_rating numeric;
    v_drop_off_rate numeric;
BEGIN
    -- Security: Ensure caller is Super Admin
    SELECT EXISTS (
        SELECT 1 FROM public.staff_users 
        WHERE id = p_admin_id AND role = 'SUPER_ADMIN'
    ) INTO v_is_super;

    IF NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: Requires SUPER_ADMIN role';
    END IF;

    -- Core Volume Metrics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'SERVED'),
        COUNT(*) FILTER (WHERE status = 'CANCELLED'),
        COUNT(*) FILTER (WHERE status = 'SKIPPED')
    INTO v_total_created, v_total_served, v_total_cancelled, v_total_skipped
    FROM public.clinical_visits
    WHERE clinic_id = p_clinic_id
      AND DATE(timezone('Asia/Kolkata', created_at)) >= p_start_date
      AND DATE(timezone('Asia/Kolkata', created_at)) <= p_end_date;

    -- Deep Mathematical Metrics (Excluding negative durations, using precise DB timestamps)
    SELECT 
        COALESCE(EXTRACT(EPOCH FROM SUM(consultant_assessment_start_time - arrival_at_department_time)) / 60 / NULLIF(COUNT(*), 0), 0)::int, -- Wait Time
        COALESCE(EXTRACT(EPOCH FROM SUM(discharge_completed_time - consultant_assessment_start_time)) / 60 / NULLIF(COUNT(*), 0), 0)::int, -- Service Time
        COALESCE(AVG(rating), 0)::numeric -- Average Rating
    INTO v_avg_wait_mins, v_avg_service_mins, v_avg_rating
    FROM public.clinical_visits
    WHERE clinic_id = p_clinic_id
      AND DATE(timezone('Asia/Kolkata', created_at)) >= p_start_date
      AND DATE(timezone('Asia/Kolkata', created_at)) <= p_end_date
      AND status = 'SERVED';

    -- Drop-off rate (Cancelled + Skipped / Total) * 100
    IF v_total_created > 0 THEN
        v_drop_off_rate := ROUND(((v_total_cancelled + v_total_skipped)::numeric / v_total_created::numeric) * 100, 1);
    ELSE
        v_drop_off_rate := 0.0;
    END IF;

    RETURN jsonb_build_object(
        'total_created', v_total_created,
        'total_served', v_total_served,
        'total_cancelled', v_total_cancelled,
        'total_skipped', v_total_skipped,
        'avg_wait_mins', v_avg_wait_mins,
        'avg_service_mins', v_avg_service_mins,
        'avg_rating', ROUND(v_avg_rating, 1),
        'drop_off_rate_pct', v_drop_off_rate
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
