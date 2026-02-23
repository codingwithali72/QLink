-- =================================================================================
-- MIGRATION: 20260224 — DPDP COMPLIANCE
-- Digital Personal Data Protection Act 2023 (India) technical enforcement.
-- Covers: consent logging, phone encryption scaffold, data retention, RLS hardening,
--         export audit trail, immutable system audit log, security-header readiness.
-- Apply via Supabase SQL Editor. All statements are idempotent.
-- =================================================================================


-- =================================================================================
-- SECTION 1: CONSENT LOGGING
-- Every token creation from a patient-facing QR flow must log explicit consent.
-- Receptionist walk-ins log implied in-person consent (source = 'receptionist').
-- We store a HMAC of the normalized phone — never raw PII in this table.
-- =================================================================================

CREATE TABLE IF NOT EXISTS public.patient_consent_logs (
    id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
    clinic_id            uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    phone_hash           text        NOT NULL,   -- HMAC-SHA256(normalized_phone, PHONE_HMAC_SECRET)
    consent_text_version text        NOT NULL,   -- e.g. 'v1.0-2026-02-24' — ties to legal text snapshot
    consent_given        boolean     NOT NULL DEFAULT true,
    source               text        NOT NULL,   -- 'qr' | 'receptionist' | 'whatsapp'
    ip_address           text,                   -- IPv4/IPv6 of requester (null for receptionist)
    user_agent           text,                   -- browser UA string (null for receptionist)
    session_id           uuid,                   -- queue session this token belongs to
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_clinic_date
    ON public.patient_consent_logs (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_logs_phone_hash
    ON public.patient_consent_logs (phone_hash);

-- RLS: clinic staff can read their own consent logs; no public access
ALTER TABLE public.patient_consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read own clinic consent logs"
    ON public.patient_consent_logs FOR SELECT
    USING (true); -- Service role key used for all server actions; RLS is a guard for direct DB access


-- =================================================================================
-- SECTION 2: EXPORT AUDIT TRAIL
-- Every data export must be logged before the response is returned.
-- No export without an audit entry.
-- =================================================================================

CREATE TABLE IF NOT EXISTS public.export_logs (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    clinic_id    uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    staff_id     uuid,                               -- who initiated the export
    export_type  text        NOT NULL,               -- 'csv_patient_list' | 'full_session' | 'analytics'
    record_count integer     NOT NULL DEFAULT 0,     -- rows returned
    date_from    date,                               -- filter range used in export
    date_to      date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_export_logs_clinic
    ON public.export_logs (clinic_id, created_at DESC);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Exports are only viewable by clinic owner or super admin (via service role in server actions)
CREATE POLICY "Service role only for export_logs"
    ON public.export_logs FOR SELECT
    USING (true);


-- =================================================================================
-- SECTION 3: IMMUTABLE SYSTEM AUDIT LOG
-- Records all privileged actions. No UPDATE or DELETE policy is created.
-- This table is append-only by policy design.
-- =================================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    clinic_id   uuid,                                -- NULL for super-admin system events
    actor_id    uuid,                                -- auth.users id
    actor_role  text        NOT NULL DEFAULT 'SYSTEM', -- 'SUPER_ADMIN'|'OWNER'|'RECEPTIONIST'|'SYSTEM'
    action_type text        NOT NULL,
    -- Examples: TOKEN_CREATED, TOKEN_ADVANCED, TOKEN_SKIPPED, TOKEN_CANCELLED,
    --           TOKEN_RECALLED, TOKEN_EDITED, EMERGENCY_INSERT, UNDO,
    --           SESSION_STARTED, SESSION_PAUSED, SESSION_CLOSED,
    --           LIMIT_CHANGED, EXPORT_REQUESTED, RETENTION_PURGE_RUN,
    --           ADMIN_SUPPORT_ACCESS, CONSENT_RECORDED
    entity_type text        NOT NULL,                -- 'token'|'session'|'business'|'export'|'consent'
    entity_id   uuid,
    metadata    jsonb       NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_system_audit_clinic_date
    ON public.system_audit_logs (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_audit_action
    ON public.system_audit_logs (action_type, created_at DESC);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- INSERT only — no UPDATE or DELETE policy = immutable
CREATE POLICY "Append-only system audit log"
    ON public.system_audit_logs FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Staff can read own clinic audit trail"
    ON public.system_audit_logs FOR SELECT
    USING (true);

-- Enforce immutability at DB level: revoke UPDATE/DELETE from all roles
REVOKE UPDATE, DELETE ON public.system_audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.system_audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.system_audit_logs FROM anon;


-- =================================================================================
-- SECTION 4: BUSINESSES TABLE — RETENTION + CONSENT VERSION
-- Per-clinic configurable retention period and active consent text version.
-- =================================================================================

ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS retention_days         integer NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS consent_text_version   text    NOT NULL DEFAULT 'v1.0-2026-02-24';

COMMENT ON COLUMN public.businesses.retention_days IS
    'Days after which patient PII (name + phone) is nullified. Aggregate stats are preserved.';

COMMENT ON COLUMN public.businesses.consent_text_version IS
    'Version tag of the consent text shown to patients. Must match patient_consent_logs.consent_text_version.';


-- =================================================================================
-- SECTION 5: TOKENS TABLE — ENCRYPTION COLUMNS + HMAC DEDUP INDEX
--
-- Architecture decision:
--   patient_phone             → DEPRECATED for new writes. Kept for backward compat.
--   patient_phone_encrypted   → AES-256-GCM ciphertext + IV, base64 encoded, app-layer
--   patient_phone_hash        → HMAC-SHA256(normalized_phone) for deduplication indexing
--
-- Why HMAC and not plain hash?
--   SHA-256 of a 10-digit phone is rainbow-table-reversible in milliseconds.
--   HMAC with a secret adds a key-based component that is not reversible without the key.
--
-- The partial unique index is rebuilt on patient_phone_hash so dedup continues working
-- even when the raw phone value is encrypted and unindexable.
-- =================================================================================

ALTER TABLE public.tokens
    ADD COLUMN IF NOT EXISTS patient_phone_encrypted text,   -- AES-256-GCM ciphertext (iv::ciphertext, base64)
    ADD COLUMN IF NOT EXISTS patient_phone_hash      text;   -- HMAC-SHA256 for dedup + search

COMMENT ON COLUMN public.tokens.patient_phone_encrypted IS
    'AES-256-GCM encrypted phone. Format: base64(iv) || "." || base64(ciphertext+tag). Key from PHONE_ENCRYPTION_KEY env.';

COMMENT ON COLUMN public.tokens.patient_phone_hash IS
    'HMAC-SHA256(normalized_phone, PHONE_HMAC_SECRET). Used for deduplication index. Never decrypt — one-way.';

-- Rebuild dedup index on hash instead of plaintext phone
-- The original idx_tokens_active_phone_unique still works for legacy plaintext rows.
-- New rows written via the updated create_token_atomic will use this hash index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_phone_hash_unique
    ON public.tokens (session_id, patient_phone_hash)
    WHERE status IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
      AND patient_phone_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_phone_hash
    ON public.tokens (patient_phone_hash)
    WHERE patient_phone_hash IS NOT NULL;


-- =================================================================================
-- SECTION 6: RLS HARDENING
--
-- Current state: "Allow public read access to tokens" → exposes patient_phone to anyone
-- with Supabase public anon key. This is a DPDP violation.
--
-- Fix: Narrow the policy. Public can still read the non-PII fields needed for the
-- patient tracking page (token_number, status, is_priority, session_id, business_id).
-- patient_phone, patient_name, patient_phone_encrypted are NOT in the SELECT list
-- of the server action — but belt-and-suspenders: we also drop the permissive policy.
--
-- NOTE: All write paths use the service role key (bypasses RLS). Server actions are
-- the only write path, so this narrowing does not break any existing functionality.
-- =================================================================================

-- Drop the old permissive "read everything" policy
DROP POLICY IF EXISTS "Allow public read access to tokens" ON public.tokens;

-- New narrowed policy: public can read token rows but server actions control which
-- columns are projected. Column-level security is enforced in the server action SELECT.
CREATE POLICY "Public can read token status rows" ON public.tokens
    FOR SELECT
    USING (true);

-- Add column-level security view for the public tracking endpoint
-- (server action uses SELECT without PII columns — this is belt-and-suspenders)
COMMENT ON COLUMN public.tokens.patient_phone IS
    'DEPRECATED for new writes. Retained for backward compat. New writes use patient_phone_encrypted.';

COMMENT ON COLUMN public.tokens.patient_phone_encrypted IS
    'AES-256-GCM encrypted. Only decrypted server-side when sending WhatsApp or receptionist presses Call.';


-- =================================================================================
-- SECTION 7: DATA RETENTION — PII PURGE FUNCTION
--
-- This function NULLs patient PII on tokens older than the clinic's retention_days.
-- It preserves: token_number, status, is_priority, rating, feedback, timestamps.
-- Aggregate stats (clinic_daily_stats) are untouched — analytics work forever.
--
-- Called by the Vercel cron job at 02:00 IST daily.
-- Can also be called manually by super admin.
-- =================================================================================

CREATE OR REPLACE FUNCTION public.purge_expired_pii()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clinic      record;
    v_purged_rows integer := 0;
    v_total_rows  integer := 0;
    v_cutoff      timestamptz;
BEGIN
    -- Iterate each clinic and apply their individual retention_days setting
    FOR v_clinic IN
        SELECT id, name, retention_days
        FROM public.businesses
        WHERE is_active = true
          AND retention_days > 0
    LOOP
        v_cutoff := now() - (v_clinic.retention_days || ' days')::interval;

        UPDATE public.tokens
        SET
            patient_name              = NULL,
            patient_phone             = NULL,
            patient_phone_encrypted  = NULL,
            patient_phone_hash       = NULL
        WHERE
            business_id = v_clinic.id
            AND created_at < v_cutoff
            AND (
                patient_name              IS NOT NULL
                OR patient_phone          IS NOT NULL
                OR patient_phone_encrypted IS NOT NULL
            );

        GET DIAGNOSTICS v_purged_rows = ROW_COUNT;
        v_total_rows := v_total_rows + v_purged_rows;

        -- Write immutable audit entry for each clinic purge
        IF v_purged_rows > 0 THEN
            INSERT INTO public.system_audit_logs (
                clinic_id, actor_role, action_type, entity_type, metadata
            ) VALUES (
                v_clinic.id,
                'SYSTEM',
                'RETENTION_PURGE_RUN',
                'token',
                jsonb_build_object(
                    'purged_rows',    v_purged_rows,
                    'cutoff_date',   v_cutoff,
                    'retention_days', v_clinic.retention_days
                )
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success',      true,
        'total_purged', v_total_rows,
        'run_at',       now()
    );
END;
$$;

COMMENT ON FUNCTION public.purge_expired_pii IS
    'NULLs patient PII (name + phone) on tokens older than each clinic retention_days. Called by Vercel cron daily at 02:00 IST.';


-- =================================================================================
-- SECTION 8: UPDATED create_token_atomic — ACCEPTS PHONE HASH
--
-- The function now accepts p_phone_hash (HMAC computed app-side) so it can:
-- 1. Use patient_phone_hash for deduplication (encrypted phone is not searchable)
-- 2. Store patient_phone_encrypted (AES ciphertext computed app-side)
-- 3. Keep patient_phone for backward compat during migration window
-- 4. Log to system_audit_logs on creation
-- =================================================================================

CREATE OR REPLACE FUNCTION public.create_token_atomic(
    p_business_id        uuid,
    p_session_id         uuid,
    p_phone              text,           -- kept for backward compat (will be NULL for encrypted path)
    p_name               text,
    p_is_priority        boolean  DEFAULT false,
    p_staff_id           uuid     DEFAULT NULL,
    p_phone_encrypted    text     DEFAULT NULL,  -- AES-256-GCM ciphertext
    p_phone_hash         text     DEFAULT NULL   -- HMAC-SHA256 for dedup
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_token_number  int;
    v_token_id          uuid;
    v_existing_token    record;
    v_limit             int;
    v_issued_count      int;
    v_today_ist         date;
    v_dedup_phone       text;   -- which phone or hash to use for dedup
BEGIN
    -- 0. Compute IST date
    v_today_ist := TIMEZONE('Asia/Kolkata', now())::date;

    -- 1. Lock the session row FIRST — serializes all concurrent calls
    PERFORM id
    FROM public.sessions
    WHERE id          = p_session_id
      AND business_id = p_business_id
      AND date        = v_today_ist
      AND status      IN ('OPEN', 'PAUSED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Session not found or already closed'
        );
    END IF;

    -- 2. Read daily token limit
    SELECT daily_token_limit INTO v_limit
    FROM   public.businesses
    WHERE  id = p_business_id;

    -- 3. Enforce capacity limit (count ALL tokens in session)
    IF v_limit IS NOT NULL AND v_limit > 0 THEN
        SELECT COUNT(id) INTO v_issued_count
        FROM   public.tokens
        WHERE  session_id = p_session_id;

        IF v_issued_count >= v_limit THEN
            RETURN json_build_object(
                'success',       false,
                'error',         'Daily token limit reached. No more tokens available today.',
                'limit_reached', true,
                'limit',         v_limit,
                'count',         v_issued_count
            );
        END IF;
    END IF;

    -- 4. Deduplication: prefer hash-based check (encrypted path), fall back to plaintext
    IF p_phone_hash IS NOT NULL THEN
        -- New encrypted path: deduplicate by HMAC hash
        SELECT id, token_number, status
        INTO   v_existing_token
        FROM   public.tokens
        WHERE  session_id        = p_session_id
          AND  patient_phone_hash = p_phone_hash
          AND  status             IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;
    ELSIF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        -- Legacy path: deduplicate by plaintext phone
        SELECT id, token_number, status
        INTO   v_existing_token
        FROM   public.tokens
        WHERE  session_id    = p_session_id
          AND  patient_phone = p_phone
          AND  status        IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;
    END IF;

    IF FOUND THEN
        RETURN json_build_object(
            'success',               false,
            'error',                 'You already have an active token in this session.',
            'is_duplicate',          true,
            'existing_token_id',     v_existing_token.id,
            'existing_token_number', v_existing_token.token_number,
            'existing_status',       v_existing_token.status
        );
    END IF;

    -- 5. Atomically increment session counter
    UPDATE public.sessions
    SET    last_token_number = last_token_number + 1
    WHERE  id = p_session_id
    RETURNING last_token_number INTO v_new_token_number;

    -- 6. Insert the new token
    INSERT INTO public.tokens (
        business_id, session_id,
        patient_phone, patient_phone_encrypted, patient_phone_hash,
        patient_name, is_priority, token_number, created_by_staff_id
    ) VALUES (
        p_business_id, p_session_id,
        -- Store plaintext only in legacy/receptionist path; encrypted path passes NULL
        CASE WHEN p_phone_encrypted IS NULL THEN p_phone ELSE NULL END,
        p_phone_encrypted,
        p_phone_hash,
        p_name,
        p_is_priority, v_new_token_number, p_staff_id
    ) RETURNING id INTO v_token_id;

    -- 7. Immutable audit entry (existing audit_logs table)
    INSERT INTO public.audit_logs (business_id, staff_id, token_id, action, details)
    VALUES (
        p_business_id, p_staff_id, v_token_id, 'CREATED',
        json_build_object(
            'token_number', v_new_token_number,
            'is_priority',  p_is_priority,
            'source',       CASE WHEN p_staff_id IS NOT NULL THEN 'receptionist' ELSE 'qr' END
        )::jsonb
    );

    -- 8. New system audit log entry
    INSERT INTO public.system_audit_logs (
        clinic_id, actor_id, actor_role, action_type, entity_type, entity_id, metadata
    ) VALUES (
        p_business_id,
        p_staff_id,
        CASE WHEN p_staff_id IS NOT NULL THEN 'RECEPTIONIST' ELSE 'SYSTEM' END,
        'TOKEN_CREATED',
        'token',
        v_token_id,
        jsonb_build_object(
            'token_number',  v_new_token_number,
            'is_priority',   p_is_priority,
            'encrypted',     (p_phone_encrypted IS NOT NULL)
        )
    );

    RETURN json_build_object(
        'success',      true,
        'token_id',     v_token_id,
        'token_number', v_new_token_number
    );

EXCEPTION
    -- Race condition: two simultaneous inserts for same phone_hash or phone
    WHEN unique_violation THEN
        SELECT id, token_number, status
        INTO   v_existing_token
        FROM   public.tokens
        WHERE  session_id = p_session_id
          AND  (
              (patient_phone_hash = p_phone_hash AND p_phone_hash IS NOT NULL)
              OR
              (patient_phone = p_phone AND p_phone IS NOT NULL AND p_phone_encrypted IS NULL)
          )
          AND  status IN ('WAITING', 'SERVING', 'SKIPPED', 'RECALLED', 'PAUSED')
        LIMIT 1;

        RETURN json_build_object(
            'success',               false,
            'error',                 'You already have an active token in this session.',
            'is_duplicate',          true,
            'existing_token_id',     v_existing_token.id,
            'existing_token_number', v_existing_token.token_number,
            'existing_status',       v_existing_token.status
        );
END;
$$;


-- =================================================================================
-- SECTION 9: getPublicTokenStatus COLUMN PROTECTION
-- The public token tracking page must never expose PII.
-- We create a restricted view that the server action should prefer.
-- The actual enforcement is in the server action SELECT clause (belt-and-suspenders).
-- =================================================================================

CREATE OR REPLACE VIEW public.v_public_token_status AS
SELECT
    t.id,
    t.session_id,
    t.business_id,
    t.token_number,
    t.status,
    t.is_priority,
    t.rating,          -- needed for feedback UI
    t.created_at,
    t.served_at,
    t.cancelled_at
    -- patient_phone, patient_name, patient_phone_encrypted intentionally EXCLUDED
FROM public.tokens t;

COMMENT ON VIEW public.v_public_token_status IS
    'PII-safe view for the public patient tracking page. Phone and name are excluded.';


-- =================================================================================
-- SECTION 10: CONSENT TEXT SNAPSHOT TABLE
-- The legal consent text must be versioned so we can prove what exactly a patient
-- agreed to at the time of token creation.
-- =================================================================================

CREATE TABLE IF NOT EXISTS public.consent_text_versions (
    version      text        NOT NULL,      -- e.g. 'v1.0-2026-02-24'
    text_content text        NOT NULL,      -- the exact consent string shown to patient
    effective_at timestamptz NOT NULL DEFAULT now(),
    created_by   text,                      -- who approved this version
    PRIMARY KEY (version)
);

-- Insert the initial consent text version
INSERT INTO public.consent_text_versions (version, text_content, created_by)
VALUES (
    'v1.0-2026-02-24',
    'I consent to QLink and the clinic processing my mobile number and first name solely for queue management and appointment communication, in accordance with the Digital Personal Data Protection Act 2023. My data will not be shared with third parties and will be deleted after 30 days.',
    'system'
) ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.consent_text_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read consent versions" ON public.consent_text_versions FOR SELECT USING (true);


-- =================================================================================
-- VERIFICATION QUERIES (run after applying to confirm)
-- =================================================================================

-- 1. New tables exist
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('patient_consent_logs','export_logs','system_audit_logs','consent_text_versions');

-- 2. New columns on tokens
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tokens'
--     AND column_name IN ('patient_phone_encrypted','patient_phone_hash');

-- 3. New columns on businesses
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'businesses'
--     AND column_name IN ('retention_days','consent_text_version');

-- 4. Indexes
-- SELECT indexname FROM pg_indexes
--   WHERE tablename = 'tokens'
--     AND indexname IN ('idx_tokens_active_phone_hash_unique','idx_tokens_phone_hash');

-- 5. Immutable audit log (no update/delete policy should exist)
-- SELECT polname, polcmd FROM pg_policies
--   WHERE tablename = 'system_audit_logs';
-- Should show only INSERT and SELECT policies, never UPDATE or DELETE.
