-- =================================================================================
-- MIGRATION: 20260225 — 100-CLINIC SAFEGUARDS (SOFT DELETION)
-- Run this on EXISTING databases to swap hard wipes for recoverable soft deletes.
-- =================================================================================

-- 1. Add deleted_at column safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE public.businesses ADD COLUMN deleted_at timestamp with time zone;
    END IF;
END $$;

-- 2. Update the RPC to use Soft Deletes instead of Hard CASCADE deletions
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

    -- VAPT FIX: Changed to Soft Delete to protect against accidental 100-clinic annihilation
    UPDATE public.businesses
    SET deleted_at = now(), is_active = false, status = 'DELETED'
    WHERE id = p_business_id;

    -- Audit
    INSERT INTO public.system_audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id
    ) VALUES (
        p_admin_id, 'SUPER_ADMIN', 'SOFT_DELETE_CLINIC', 'business', p_business_id
    );

    RETURN json_build_object('success', true);
END;
$$;
