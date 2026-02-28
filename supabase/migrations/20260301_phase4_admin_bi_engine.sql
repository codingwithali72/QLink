-- =================================================================================
-- QLINK RE-ARCHITECTURE PHASE 4: ADMIN BI ENGINE
-- Implements sibtain.md research patterns (lines 30-33):
-- "Time-series line graphs", "Provider productivity metrics",
-- "Bar graphs projecting daily revenue vs actual", "Wait heatmaps"
-- Also wires usage_metrics tracking into the system.
-- =================================================================================

-- ==============================================================================
-- 1. CLINIC ANNOUNCEMENTS (TV Infotainment Zone content source)
-- Sibtain.md L60: "streaming dynamic infotainment. Display weather updates, 
--   RSS news feeds, or customized clinic promotional content."
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."clinic_announcements" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "body" text,
    "type" text NOT NULL DEFAULT 'HEALTH_TIP', -- 'HEALTH_TIP','PROMOTION','ALERT','NOTICE'
    "display_from" timestamp with time zone DEFAULT now(),
    "display_until" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_announcements_clinic_active" ON "public"."clinic_announcements" ("clinic_id", "is_active", "display_from", "display_until");

ALTER TABLE "public"."clinic_announcements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Announcements isolated by clinic" ON "public"."clinic_announcements";
CREATE POLICY "Announcements isolated by clinic" ON "public"."clinic_announcements"
FOR ALL USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);

-- Allow TV display to read active announcements without auth
DROP POLICY IF EXISTS "Public read active announcements for TV" ON "public"."clinic_announcements";
CREATE POLICY "Public read active announcements for TV" ON "public"."clinic_announcements"
FOR SELECT USING (
    is_active = true 
    AND (display_from IS NULL OR display_from <= now())
    AND (display_until IS NULL OR display_until >= now())
);

-- =================================================================================
-- 2. DOCTOR PRODUCTIVITY METRICS VIEW
-- Sibtain.md L33: "provider productivity metrics via comparative horizontal bar charts,
--   juxtaposing the actual duration of physician consultations against scheduled blocks"
-- =================================================================================
CREATE OR REPLACE VIEW public.v_doctor_productivity AS
SELECT
    d.id AS doctor_id,
    d.name AS doctor_name,
    dep.name AS department_name,
    cv.clinic_id,
    DATE(cv.created_at) AS visit_date,
    COUNT(cv.id) AS total_visits,
    COUNT(cv.id) FILTER (WHERE cv.status = 'SERVED') AS served_count,
    COUNT(cv.id) FILTER (WHERE cv.status = 'CANCELLED') AS cancelled_count,
    COUNT(cv.id) FILTER (WHERE cv.status = 'SKIPPED') AS skipped_count,
    AVG(
        EXTRACT(EPOCH FROM (cv.discharge_completed_time - cv.consultant_assessment_start_time)) / 60
    ) FILTER (WHERE cv.discharge_completed_time IS NOT NULL AND cv.consultant_assessment_start_time IS NOT NULL) AS avg_consultation_mins,
    AVG(
        EXTRACT(EPOCH FROM (cv.consultant_assessment_start_time - cv.arrival_at_department_time)) / 60
    ) FILTER (WHERE cv.consultant_assessment_start_time IS NOT NULL) AS avg_wait_mins,
    AVG(cv.priority_score) AS avg_queue_score
FROM public.clinical_visits cv
LEFT JOIN public.doctors d ON d.id = cv.assigned_doctor_id
LEFT JOIN public.departments dep ON dep.id = cv.department_id
WHERE cv.status IN ('SERVED', 'CANCELLED', 'SKIPPED')
GROUP BY d.id, d.name, dep.name, cv.clinic_id, DATE(cv.created_at);


-- =================================================================================
-- 3. HOURLY FOOTFALL HEATMAP VIEW
-- Sibtain.md L32: "Time-series line graphs to track daily patient footfall against
--   historical averages, allowing administrators to predict peak OPD hours"
-- =================================================================================
CREATE OR REPLACE VIEW public.v_hourly_footfall AS
SELECT
    clinic_id,
    DATE(created_at) AS visit_date,
    EXTRACT(HOUR FROM created_at) AS hour_of_day,
    TO_CHAR(created_at, 'Day') AS day_of_week,
    COUNT(*) AS token_count,
    COUNT(*) FILTER (WHERE is_priority = true) AS priority_count,
    AVG(
        EXTRACT(EPOCH FROM (consultant_assessment_start_time - arrival_at_department_time)) / 60
    ) FILTER (WHERE consultant_assessment_start_time IS NOT NULL) AS avg_wait_mins
FROM public.clinical_visits
GROUP BY clinic_id, DATE(created_at), EXTRACT(HOUR FROM created_at), TO_CHAR(created_at, 'Day');


-- =================================================================================
-- 4. WHATSAPP COST TRACKER VIEW (Template Cost Analytics)
-- sibtain.md WhatsApp Engine Phase: "Template cost tracker, Retry rate monitor"
-- =================================================================================
ALTER TABLE "public"."whatsapp_logs" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0;

CREATE OR REPLACE VIEW public.v_whatsapp_analytics AS
SELECT
    clinic_id,
    DATE(created_at) AS log_date,
    template_name,
    COUNT(*) AS total_sent,
    COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
    COUNT(*) FILTER (WHERE status = 'read') AS read_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE retry_count > 0) AS retried_count,
    ROUND(
        COUNT(*) FILTER (WHERE status IN ('delivered','read'))::numeric / NULLIF(COUNT(*), 0) * 100, 2
    ) AS delivery_rate_pct
FROM public.whatsapp_logs
GROUP BY clinic_id, DATE(created_at), template_name;


-- =================================================================================
-- 5. USAGE METRICS AUTO-UPDATER TRIGGER
-- Aggregates key metrics to usage_metrics table daily.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.fn_update_usage_metrics_on_token()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.usage_metrics (clinic_id, date, tokens_created)
    VALUES (NEW.clinic_id, CURRENT_DATE, 1)
    ON CONFLICT (clinic_id, date) 
    DO UPDATE SET 
        tokens_created = usage_metrics.tokens_created + 1,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_usage_on_visit ON public.clinical_visits;
CREATE TRIGGER trg_update_usage_on_visit
    AFTER INSERT ON public.clinical_visits
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_usage_metrics_on_token();


-- =================================================================================
-- 6. DPDP AUTO-PURGE JOB (30-day default)
-- Sibtain.md Phase 8: "DPDP auto purge (30 days default)"
-- Scrubs plaintext phone field and non-essential PII after retention period.
-- =================================================================================
CREATE OR REPLACE FUNCTION public.fn_dpdp_auto_purge()
RETURNS void AS $$
BEGIN
    -- Scrub deprecated plaintext phone field after 30 days
    UPDATE public.patients
    SET phone = NULL
    WHERE phone IS NOT NULL
      AND created_at < NOW() - INTERVAL '30 days';

    -- Soft-scrub patient consents that have been withdrawn
    UPDATE public.patient_consents
    SET digital_signature = '[PURGED]', ip_address = NULL
    WHERE withdrawn_at IS NOT NULL
      AND withdrawn_at < NOW() - INTERVAL '30 days';
      
    RAISE NOTICE 'DPDP Auto-Purge completed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
