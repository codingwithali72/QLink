-- =================================================================================
-- PHASE 15: CLINICAL STATS & ADMIN COMPATIBILITY
-- Bridges clinical_visits to clinic_daily_stats and updates Admin RPCs.
-- =================================================================================

-- 1. Updated refresh_clinic_daily_stats to use clinical_visits
CREATE OR REPLACE FUNCTION public.refresh_clinical_daily_stats(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.clinic_daily_stats (
        business_id, date,
        total_tokens, served_count, skipped_count, cancelled_count,
        recall_count, emergency_count, active_tokens,
        avg_wait_time_minutes, avg_rating,
        whatsapp_count, sms_count, updated_at
    )
    SELECT
        b.id    AS business_id,
        p_date  AS date,

        COALESCE(COUNT(cv.id), 0)                                                                       AS total_tokens,
        COALESCE(SUM(CASE WHEN cv.status = 'SERVED'    THEN 1 ELSE 0 END), 0)                          AS served_count,
        COALESCE(SUM(CASE WHEN cv.status = 'SKIPPED'   THEN 1 ELSE 0 END), 0)                          AS skipped_count,
        COALESCE(SUM(CASE WHEN cv.status = 'CANCELLED' THEN 1 ELSE 0 END), 0)                          AS cancelled_count,

        -- Recall count from audit logs
        (SELECT COUNT(*) FROM public.security_audit_logs al
         WHERE al.clinic_id = b.id AND al.action_type = 'VISIT_RECALLED'
           AND (al.timestamp AT TIME ZONE 'Asia/Kolkata')::date = p_date)                            AS recall_count,

        COALESCE(SUM(CASE WHEN cv.is_priority = true THEN 1 ELSE 0 END), 0)                            AS emergency_count,
        COALESCE(SUM(CASE WHEN cv.status IN ('WAITING','SERVING','SKIPPED','PAUSED')
                          THEN 1 ELSE 0 END), 0)                                                       AS active_tokens,

        -- Average wait time (arrival to assessment)
        COALESCE(ROUND(EXTRACT(EPOCH FROM AVG(
            CASE WHEN cv.status = 'SERVED' AND cv.consultant_assessment_start_time IS NOT NULL
                 THEN (cv.consultant_assessment_start_time - cv.arrival_at_department_time) ELSE NULL END
        )) / 60), 0)                                                                                   AS avg_wait_time_minutes,

        -- Average rating
        CASE WHEN COUNT(cv.rating) > 0 THEN ROUND(AVG(cv.rating), 2) ELSE NULL END                     AS avg_rating,

        (SELECT COUNT(*) FROM public.whatsapp_alerts_queue wa
         JOIN public.clinical_visits v2 ON wa.token_id = v2.id
         WHERE v2.clinic_id = b.id AND (wa.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date)    AS whatsapp_count,
        0                                                                                              AS sms_count,
        now()                                                                                          AS updated_at

    FROM public.businesses b
    LEFT JOIN public.sessions s ON s.business_id = b.id AND s.date = p_date
    LEFT JOIN public.clinical_visits cv ON cv.session_id  = s.id
    GROUP BY b.id, p_date

    ON CONFLICT (business_id, date) DO UPDATE SET
        total_tokens          = EXCLUDED.total_tokens,
        served_count          = EXCLUDED.served_count,
        skipped_count         = EXCLUDED.skipped_count,
        cancelled_count       = EXCLUDED.cancelled_count,
        recall_count          = EXCLUDED.recall_count,
        emergency_count       = EXCLUDED.emergency_count,
        active_tokens         = EXCLUDED.active_tokens,
        avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
        avg_rating            = EXCLUDED.avg_rating,
        whatsapp_count        = EXCLUDED.whatsapp_count,
        updated_at            = now();
END;
$$;

-- 2. Trigger for clinical_visits
CREATE OR REPLACE FUNCTION public.fn_update_clinical_stats_on_visit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_id uuid;
    v_date        date;
BEGIN
    SELECT s.business_id, s.date
    INTO   v_business_id, v_date
    FROM   public.sessions s
    WHERE  s.id = COALESCE(NEW.session_id, OLD.session_id);

    IF v_business_id IS NULL THEN RETURN NEW; END IF;
    IF v_date != TIMEZONE('Asia/Kolkata', now())::date THEN RETURN NEW; END IF;

    PERFORM public.refresh_clinical_daily_stats(v_date);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_clinical_stats_on_visit ON public.clinical_visits;
CREATE TRIGGER trg_update_clinical_stats_on_visit
AFTER INSERT OR UPDATE OF status, rating
ON public.clinical_visits
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_clinical_stats_on_visit_change();

-- 3. Update Force Close RPC
CREATE OR REPLACE FUNCTION public.rpc_force_close_session_clinical(
    p_business_id uuid,
    p_staff_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id uuid;
    v_today date;
    v_cancelled_count int := 0;
BEGIN
    v_today := TIMEZONE('Asia/Kolkata', now())::date;

    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE business_id = p_business_id
      AND date = v_today
      AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active session found for today.');
    END IF;

    WITH cancelled AS (
        UPDATE public.clinical_visits
        SET status = 'CANCELLED', previous_status = status, cancelled_at = now()
        WHERE session_id = v_session_id AND status = 'WAITING'
        RETURNING id
    )
    SELECT count(*) INTO v_cancelled_count FROM cancelled;

    UPDATE public.sessions
    SET status = 'CLOSED', closed_at = now()
    WHERE id = v_session_id;

    INSERT INTO public.security_audit_logs (clinic_id, actor_id, action_type, table_name, record_id)
    VALUES (p_business_id, p_staff_id, 'SESSION_FORCE_CLOSED', 'sessions', v_session_id);

    RETURN json_build_object('success', true, 'session_id', v_session_id, 'cancelled_tokens', v_cancelled_count);
END;
$$;
