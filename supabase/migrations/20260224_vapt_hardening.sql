-- =================================================================================
-- MIGRATION: 20260224 — VAPT STRUCTURAL HARDENING
-- Run this on EXISTING databases. For fresh installs, use 9999_master_fresh_install.sql.
-- =================================================================================

-- 0. Add missing `status` column to businesses (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.businesses ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
    END IF;
END $$;

-- 1. Atomic Session Force Close
-- Hard locks the session, cancels all waiting tokens, closes session, logs to audit.
CREATE OR REPLACE FUNCTION public.rpc_force_close_session(
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

    -- Lock the session row
    SELECT id INTO v_session_id
    FROM public.sessions
    WHERE business_id = p_business_id
      AND date = v_today
      AND status IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active session found for today.');
    END IF;

    -- Cancel all waiting tokens atomically
    WITH cancelled AS (
        UPDATE public.tokens
        SET status = 'CANCELLED', previous_status = status, cancelled_at = now()
        WHERE session_id = v_session_id AND status = 'WAITING'
        RETURNING id
    )
    SELECT count(*) INTO v_cancelled_count FROM cancelled;

    -- Close the session
    UPDATE public.sessions
    SET status = 'CLOSED', closed_at = now()
    WHERE id = v_session_id;

    -- System Audit Log
    INSERT INTO public.system_audit_logs (
        clinic_id, actor_id, actor_role, action_type, entity_type, entity_id, metadata
    ) VALUES (
        p_business_id, p_staff_id, 'SUPER_ADMIN', 'SESSION_FORCE_CLOSED', 'session', v_session_id,
        jsonb_build_object('tokens_cancelled', v_cancelled_count)
    );

    RETURN json_build_object('success', true, 'session_id', v_session_id, 'cancelled_tokens', v_cancelled_count);
END;
$$;

-- 2. Atomic Clinic Deletion
-- Transactionally wipes clinic data before the Auth user cleanup happens in Edge.
CREATE OR REPLACE FUNCTION public.rpc_delete_clinic_transactional(
    p_business_id uuid,
    p_admin_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_tokens int;
BEGIN
    -- Guard: active tokens
    SELECT count(*) INTO v_active_tokens
    FROM public.tokens
    WHERE business_id = p_business_id AND status IN ('WAITING', 'SERVING');

    IF v_active_tokens > 0 THEN
        RETURN json_build_object('success', false, 'error', 'Cannot delete clinic with active queue tokens. Close session first.');
    END IF;

    -- CASCADE deletes: sessions, tokens, audit_logs, message_logs, staff_users, etc.
    DELETE FROM public.businesses WHERE id = p_business_id;

    -- Audit (clinic_id is null because the row is gone)
    INSERT INTO public.system_audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id
    ) VALUES (
        p_admin_id, 'SUPER_ADMIN', 'DELETE_CLINIC', 'business', p_business_id
    );

    RETURN json_build_object('success', true);
END;
$$;
