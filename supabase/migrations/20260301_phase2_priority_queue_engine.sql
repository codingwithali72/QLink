-- =================================================================================
-- QLINK RE-ARCHITECTURE PHASE 2: PRIORITY QUEUE ENGINE
-- Adds Priority Scoring, Multi-Doctor allocation, and Visit Type enhancements.
-- =================================================================================

-- 1. Extend clinical_visits with priority_score and visit_type 
-- (adding columns safely, existing rows get defaults)

ALTER TABLE "public"."clinical_visits"
    ADD COLUMN IF NOT EXISTS "priority_score" integer DEFAULT 100,
    ADD COLUMN IF NOT EXISTS "visit_type_v2" text DEFAULT 'WALKIN', -- 'WALKIN','PREBOOKED','EMERGENCY','LAB_RETURN','VIP','FOLLOWUP'
    ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'RECEPTION', -- 'RECEPTION','WHATSAPP','QR','KIOSK'
    ADD COLUMN IF NOT EXISTS "branch_id" uuid, -- Denorm for fast branch-scoped queries
    ADD COLUMN IF NOT EXISTS "requested_doctor_id" uuid REFERENCES "public"."doctors"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "assigned_doctor_id" uuid REFERENCES "public"."doctors"("id") ON DELETE SET NULL;

-- Composite index for score-based queue ordering (branch + status + priority_score)
CREATE INDEX IF NOT EXISTS "idx_cv_branch_status_score"
    ON "public"."clinical_visits" ("clinic_id", "session_id", "status", "priority_score" DESC, "token_number" ASC);

-- =================================================================================
-- 2. QUEUE EVENTS LOG (Immutable timeline of every state change)
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."queue_events" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "clinic_id" uuid NOT NULL,
    "event_type" text NOT NULL, -- 'QUEUED','SERVING','SERVED','SKIPPED','CANCELLED','PRIORITY_UPGRADED','DOCTOR_REASSIGNED'
    "from_status" text,
    "to_status" text,
    "actor_id" uuid, -- Staff user who triggered this, null = system/patient
    "actor_type" text DEFAULT 'STAFF', -- 'STAFF', 'PATIENT', 'SYSTEM'
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_queue_events_visit" ON "public"."queue_events" ("visit_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_queue_events_clinic_today" ON "public"."queue_events" ("clinic_id", "created_at");

-- Enable RLS
ALTER TABLE "public"."queue_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Queue events isolated by clinic" ON "public"."queue_events";
CREATE POLICY "Queue events isolated by clinic" ON "public"."queue_events"
FOR ALL USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- =================================================================================
-- 3. USAGE METRICS (Billing & Monitoring)
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."usage_metrics" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "date" date NOT NULL DEFAULT CURRENT_DATE,
    "tokens_created" integer DEFAULT 0,
    "whatsapp_sent" integer DEFAULT 0,
    "whatsapp_failed" integer DEFAULT 0,
    "whatsapp_delivered" integer DEFAULT 0,
    "webhooks_received" integer DEFAULT 0,
    "active_ws_peak" integer DEFAULT 0,
    "p95_response_ms" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("clinic_id", "date")
);

ALTER TABLE "public"."usage_metrics" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usage metrics isolated by clinic" ON "public"."usage_metrics";
CREATE POLICY "Usage metrics isolated by clinic" ON "public"."usage_metrics"
FOR SELECT USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- =================================================================================
-- 4. PLANS TABLE (SaaS Tier Definitions)
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text UNIQUE NOT NULL, -- 'STARTER', 'GROWTH', 'HOSPITAL'
    "daily_token_limit" integer DEFAULT 50,
    "daily_message_limit" integer DEFAULT 100,
    "max_doctors" integer DEFAULT 1,
    "max_branches" integer DEFAULT 1,
    "price_inr" integer DEFAULT 0, -- In paise (e.g. 299900 = ₹2999)
    "features" jsonb DEFAULT '[]'::jsonb, -- Feature flags as JSON array
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Seed plans (Robust to renames)
DO $$
DECLARE
    col_name text;
BEGIN
    -- Check which column name exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='price_monthly') THEN
        col_name := 'price_monthly';
    ELSE
        col_name := 'price_inr';
    END IF;

    EXECUTE format('
        INSERT INTO "public"."plans" ("name", "daily_token_limit", "daily_message_limit", "max_doctors", "max_branches", %I, "features")
        VALUES
            (''STARTER'',   50,   100,  1,  1, 0,       ''["queue_management","whatsapp_basic"]''),
            (''GROWTH'',    500,  2000, 5,  2, 299900,  ''["queue_management","whatsapp_utility","multi_doctor","analytics_basic"]''),
            (''HOSPITAL'',  9999, 9999, 50, 10, 0,      ''["queue_management","whatsapp_utility","multi_doctor","analytics_advanced","tv_signage","priority_engine","api_access"]'')
        ON CONFLICT ("name") DO NOTHING
    ', col_name);
END $$;

-- =================================================================================
-- 5. PRIORITY SCORING RPC FUNCTION
-- Called on every token insert to calculate the initial priority_score.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_calculate_priority_score(
    p_visit_type text,
    p_is_priority boolean,
    p_wait_minutes integer DEFAULT 0,
    p_dept_load_factor integer DEFAULT 0
) RETURNS integer AS $$
DECLARE
    base_score integer;
    score integer;
BEGIN
    -- Base priority weights by visit type
    CASE p_visit_type
        WHEN 'EMERGENCY'   THEN base_score := 10000;
        WHEN 'VIP'         THEN base_score := 5000;
        WHEN 'PREBOOKED'   THEN base_score := 500;
        WHEN 'FOLLOWUP'    THEN base_score := 300;
        WHEN 'LAB_RETURN'  THEN base_score := 200;
        ELSE base_score := 100; -- WALKIN default
    END CASE;

    -- Emergency flag override (from is_priority bool)
    IF p_is_priority THEN
        base_score := GREATEST(base_score, 5000);
    END IF;

    -- Add wait time penalty (rewards patience)
    -- Every 5 minutes of waiting adds +10 to score to prevent starvation
    score := base_score + (FLOOR(p_wait_minutes / 5) * 10) - (p_dept_load_factor * 5);

    RETURN GREATEST(0, score);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =================================================================================
-- 6. DOCTOR ALLOCATION RPC (Round Robin & Least Busy)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_allocate_doctor(
    p_session_id uuid,
    p_department_id uuid,
    p_requested_doctor_id uuid DEFAULT NULL,
    p_strategy text DEFAULT 'LEAST_BUSY' -- 'ROUND_ROBIN', 'LEAST_BUSY', 'SHORTEST_QUEUE'
) RETURNS uuid AS $$
DECLARE
    allocated_doctor_id uuid;
BEGIN
    -- If a specific doctor was requested, honour it (manual override)
    IF p_requested_doctor_id IS NOT NULL THEN
        -- Verify they're AVAILABLE
        IF EXISTS (
            SELECT 1 FROM public.doctors 
            WHERE id = p_requested_doctor_id AND is_active = true
        ) THEN
            RETURN p_requested_doctor_id;
        END IF;
    END IF;

    IF p_strategy = 'LEAST_BUSY' THEN
        -- Assign to doctor with fewest WAITING + SERVING visits in this session
        SELECT d.id INTO allocated_doctor_id
        FROM public.doctors d
        WHERE d.department_id = p_department_id
          AND d.is_active = true
        ORDER BY (
            SELECT COUNT(*) FROM public.clinical_visits cv
            WHERE cv.assigned_doctor_id = d.id
              AND cv.session_id = p_session_id
              AND cv.status IN ('WAITING', 'SERVING')
        ) ASC, d.id ASC -- Tiebreak by id for stability
        LIMIT 1;

    ELSIF p_strategy = 'ROUND_ROBIN' THEN
        -- Assign to the doctor who was assigned least recently
        SELECT d.id INTO allocated_doctor_id
        FROM public.doctors d
        WHERE d.department_id = p_department_id
          AND d.is_active = true
        ORDER BY (
            SELECT COALESCE(MAX(cv.created_at), '1970-01-01')
            FROM public.clinical_visits cv
            WHERE cv.assigned_doctor_id = d.id
              AND cv.session_id = p_session_id
        ) ASC
        LIMIT 1;

    ELSE -- SHORTEST_QUEUE
        SELECT d.id INTO allocated_doctor_id
        FROM public.doctors d
        WHERE d.department_id = p_department_id
          AND d.is_active = true
        ORDER BY (
            SELECT COUNT(*) FROM public.clinical_visits cv
            WHERE cv.assigned_doctor_id = d.id
              AND cv.session_id = p_session_id
              AND cv.status = 'WAITING'
        ) ASC
        LIMIT 1;
    END IF;

    RETURN allocated_doctor_id;
END;
$$ LANGUAGE plpgsql;

-- =================================================================================
-- 7. TRIGGER: Auto-log queue events on visit status changes
-- =================================================================================
CREATE OR REPLACE FUNCTION public.fn_log_queue_event()
RETURNS trigger AS $$
BEGIN
    -- Only fire on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.queue_events (
            visit_id, clinic_id, event_type,
            from_status, to_status, actor_id, actor_type
        ) VALUES (
            NEW.id,
            NEW.clinic_id,
            CASE NEW.status
                WHEN 'WAITING'   THEN 'QUEUED'
                WHEN 'SERVING'   THEN 'SERVING'
                WHEN 'SERVED'    THEN 'SERVED'
                WHEN 'SKIPPED'   THEN 'SKIPPED'
                WHEN 'CANCELLED' THEN 'CANCELLED'
                ELSE 'STATUS_CHANGED'
            END,
            OLD.status,
            NEW.status,
            NEW.created_by_staff_id,
            CASE WHEN NEW.created_by_staff_id IS NULL THEN 'SYSTEM' ELSE 'STAFF' END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_queue_events ON public.clinical_visits;
CREATE TRIGGER trg_log_queue_events
    AFTER UPDATE ON public.clinical_visits
    FOR EACH ROW EXECUTE FUNCTION public.fn_log_queue_event();
