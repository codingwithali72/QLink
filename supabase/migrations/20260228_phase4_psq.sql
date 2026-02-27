-- =================================================================================
-- PHASE 4: PSQ KPI AUTOMATION ENGINE (NABH 6th Edition)
-- Automated Outpatient, Diagnostic, and Discharge Waiting Times
-- =================================================================================

-- 1. Create KPI Aggregation Table
-- Strict Monthly Aggregation Engine per Clinic
CREATE TABLE "public"."psq_kpi_monthly_reports" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "report_month" date NOT NULL, -- e.g. '2026-02-01' representing February
    
    -- PSQ.3c: Outpatient Waiting Time
    "opd_total_patients_assessed" integer NOT NULL DEFAULT 0,
    "opd_total_wait_minutes" numeric NOT NULL DEFAULT 0,
    
    -- Diagnostic Waiting Time
    "diag_total_tests" integer NOT NULL DEFAULT 0,
    "diag_total_wait_minutes" numeric NOT NULL DEFAULT 0,
    
    -- Discharge Turnaround Time
    "disc_total_discharges" integer NOT NULL DEFAULT 0,
    "disc_total_turnaround_minutes" numeric NOT NULL DEFAULT 0,
    
    -- Emergency KPI
    "er_total_patients" integer NOT NULL DEFAULT 0,
    "er_sla_breach_count" integer NOT NULL DEFAULT 0,
    
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("clinic_id", "report_month")
);

ALTER TABLE "public"."psq_kpi_monthly_reports" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KPI Reports isolated by clinic" ON "public"."psq_kpi_monthly_reports"
FOR ALL USING (
    clinic_id IN (
        SELECT business_id FROM public.staff_users WHERE id = auth.uid()
    )
);


-- 2. Diagnostic Specific Flow Tracking
-- Required a new table to strictly measure "requisition_presented" vs "test_start"
CREATE TABLE "public"."diagnostic_tests" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "test_name" text NOT NULL,
    "requisition_presented_time" timestamp with time zone NOT NULL DEFAULT now(),
    "test_start_time" timestamp with time zone,
    "test_completed_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."diagnostic_tests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Diagnostic Tests isolated by clinic" ON "public"."diagnostic_tests"
FOR ALL USING (
    visit_id IN (
        SELECT id FROM public.clinical_visits WHERE clinic_id IN (
            SELECT business_id FROM public.staff_users WHERE id = auth.uid()
        )
    )
);

-- Constraint: test cannot start before requisition
CREATE OR REPLACE FUNCTION public.check_diag_no_negative_wait_times()
RETURNS trigger AS $$
BEGIN
    IF NEW.test_start_time IS NOT NULL AND NEW.test_start_time < NEW.requisition_presented_time THEN
        RAISE EXCEPTION 'Constraint Violation: Diagnostic test started before requisition presented.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_diag_positive_wait_times
BEFORE INSERT OR UPDATE ON "public"."diagnostic_tests"
FOR EACH ROW EXECUTE FUNCTION public.check_diag_no_negative_wait_times();


-- 3. The Math Engine: Calculate KPIs Daily and Rollup to Monthly
-- This function is executed via CRON at the end of every day to incrementally build the monthly report.
CREATE OR REPLACE FUNCTION public.cron_aggregate_psq_kpis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_month date;
BEGIN
    -- Truncate to the 1st of the current month
    v_target_month := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;

    -- Upsert the aggregation using mathematically strict filters
    INSERT INTO public.psq_kpi_monthly_reports (
        clinic_id, report_month,
        opd_total_patients_assessed, opd_total_wait_minutes,
        diag_total_tests, diag_total_wait_minutes,
        disc_total_discharges, disc_total_turnaround_minutes,
        er_total_patients, er_sla_breach_count
    )
    SELECT 
        cv.clinic_id,
        v_target_month,
        
        -- OPD Math calculation: ignore junior doctor (ensure consultant assessment used), ignore day-care
        COUNT(CASE WHEN cv.visit_type = 'OPD' AND cv.consultant_assessment_start_time IS NOT NULL THEN 1 ELSE NULL END) AS opd_total_patients_assessed,
        COALESCE(SUM(
            CASE WHEN cv.visit_type = 'OPD' AND cv.consultant_assessment_start_time IS NOT NULL 
            THEN GREATEST(0, EXTRACT(EPOCH FROM (cv.consultant_assessment_start_time - cv.arrival_at_department_time))/60)
            ELSE 0 END
        ), 0) AS opd_total_wait_minutes,
        
        -- Diag Math Calculation (Joined via subquery to avoid cartesian scaling issues)
        (SELECT COUNT(*) FROM public.diagnostic_tests dt JOIN public.clinical_visits v2 ON dt.visit_id = v2.id WHERE v2.clinic_id = cv.clinic_id AND date_trunc('month', v2.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_month AND dt.test_start_time IS NOT NULL) AS diag_total_tests,
        (SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (dt.test_start_time - dt.requisition_presented_time))/60)), 0) FROM public.diagnostic_tests dt JOIN public.clinical_visits v2 ON dt.visit_id = v2.id WHERE v2.clinic_id = cv.clinic_id AND date_trunc('month', v2.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_month AND dt.test_start_time IS NOT NULL) AS diag_total_wait_minutes,

        -- Discharge Math Calculation
        COUNT(CASE WHEN cv.visit_type = 'IPD' AND cv.discharge_completed_time IS NOT NULL AND cv.discharge_order_time IS NOT NULL THEN 1 ELSE NULL END) AS disc_total_discharges,
        COALESCE(SUM(
            CASE WHEN cv.visit_type = 'IPD' AND cv.discharge_completed_time IS NOT NULL AND cv.discharge_order_time IS NOT NULL
            THEN GREATEST(0, EXTRACT(EPOCH FROM (cv.discharge_completed_time - cv.discharge_order_time))/60)
            ELSE 0 END
        ), 0) AS disc_total_turnaround_minutes,

        -- ER Math Calculation
        COUNT(CASE WHEN cv.visit_type = 'ER' THEN 1 ELSE NULL END) AS er_total_patients,
        (SELECT COUNT(DISTINCT tr.visit_id) FROM public.triage_records tr JOIN public.clinical_visits v2 ON tr.visit_id = v2.id WHERE v2.clinic_id = cv.clinic_id AND date_trunc('month', v2.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_target_month AND tr.escalated_at IS NOT NULL) AS er_sla_breach_count

    FROM public.clinical_visits cv
    WHERE date_trunc('month', cv.arrival_at_department_time AT TIME ZONE 'Asia/Kolkata')::date = v_target_month
    GROUP BY cv.clinic_id, v_target_month

    ON CONFLICT (clinic_id, report_month) DO UPDATE SET 
        opd_total_patients_assessed = EXCLUDED.opd_total_patients_assessed,
        opd_total_wait_minutes = EXCLUDED.opd_total_wait_minutes,
        diag_total_tests = EXCLUDED.diag_total_tests,
        diag_total_wait_minutes = EXCLUDED.diag_total_wait_minutes,
        disc_total_discharges = EXCLUDED.disc_total_discharges,
        disc_total_turnaround_minutes = EXCLUDED.disc_total_turnaround_minutes,
        er_total_patients = EXCLUDED.er_total_patients,
        er_sla_breach_count = EXCLUDED.er_sla_breach_count,
        updated_at = now();

END;
$$;
