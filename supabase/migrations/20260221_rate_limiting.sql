-- =================================================================================
-- QLINK MIGRATION: POSTGRES RATE LIMITING
-- Execution Phase 5: Preventing automated abuse/DDoS on token generation
-- =================================================================================

CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "ip_address" text NOT NULL,
    "endpoint" text NOT NULL,
    "hits" integer DEFAULT 1,
    "expires_at" timestamp with time zone NOT NULL,
    PRIMARY KEY ("ip_address", "endpoint")
);

-- Allows public access to write limits via the RPC, but table is inaccessible directly
ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;

-- Highly optimized atomic rate checker (avoids Upstash/Redis costs for the user)
CREATE OR REPLACE FUNCTION public.rpc_check_rate_limit(p_ip text, p_endpoint text, p_max_hits int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hits int;
    v_expires_at timestamp with time zone;
BEGIN
    SELECT hits, expires_at INTO v_hits, v_expires_at 
    FROM public.rate_limits 
    WHERE ip_address = p_ip AND endpoint = p_endpoint FOR UPDATE;

    IF v_hits IS NULL THEN
        -- First hit
        INSERT INTO public.rate_limits (ip_address, endpoint, hits, expires_at)
        VALUES (p_ip, p_endpoint, 1, now() + (p_window_seconds || ' seconds')::interval);
        RETURN true;
    ELSIF v_expires_at < now() THEN
        -- Window expired, reset
        UPDATE public.rate_limits 
        SET hits = 1, expires_at = now() + (p_window_seconds || ' seconds')::interval
        WHERE ip_address = p_ip AND endpoint = p_endpoint;
        RETURN true;
    ELSIF v_hits < p_max_hits THEN
        -- Within limit
        UPDATE public.rate_limits 
        SET hits = hits + 1
        WHERE ip_address = p_ip AND endpoint = p_endpoint;
        RETURN true;
    ELSE
        -- Rate limited!
        RETURN false;
    END IF;
END;
$$;
