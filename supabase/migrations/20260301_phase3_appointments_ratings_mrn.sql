-- =================================================================================
-- QLINK RE-ARCHITECTURE PHASE 3: APPOINTMENTS, RATINGS, MRN & TOKEN CONTINUITY
-- Implements DocTrue-parity features from sibtain.md research (lines 1-141):
-- 1. Pre-booked appointment reservations with Virtual Holds
-- 2. Post-visit ratings & feedback
-- 3. Medical Record Number (MRN) for patient lookup
-- 4. Lab Return Auto-Priority RPC (token continuity)
-- 5. No-show probability scoring seed
-- =================================================================================

-- 1. MRN: Add Medical Record Number to patients table
ALTER TABLE "public"."patients"
    ADD COLUMN IF NOT EXISTS "mrn" text, -- Clinic-scoped Medical Record Number, e.g. "OPD-2024-00123"
    ADD COLUMN IF NOT EXISTS "age" integer,
    ADD COLUMN IF NOT EXISTS "gender" text, -- 'MALE', 'FEMALE', 'OTHER'
    ADD COLUMN IF NOT EXISTS "blood_group" text,
    ADD COLUMN IF NOT EXISTS "total_visits" integer DEFAULT 0;

-- MRN unique index per clinic
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patients_clinic_mrn_unique"
    ON "public"."patients" ("clinic_id", "mrn")
    WHERE mrn IS NOT NULL;

-- Function to auto-generate sequential MRN per clinic
CREATE OR REPLACE FUNCTION public.fn_generate_mrn(p_clinic_id uuid)
RETURNS text AS $$
DECLARE
    year_part text := TO_CHAR(NOW(), 'YYYY');
    seq_num integer;
    result_mrn text;
BEGIN
    SELECT COUNT(*) + 1 INTO seq_num
    FROM public.patients
    WHERE clinic_id = p_clinic_id;

    result_mrn := 'OPD-' || year_part || '-' || LPAD(seq_num::text, 5, '0');
    RETURN result_mrn;
END;
$$ LANGUAGE plpgsql;


-- =================================================================================
-- 2. APPOINTMENTS TABLE (Pre-booked slots with Virtual Holds)
-- Sibtain.md L123: "Virtual Holds on the timeline for scheduled patients while
--   allowing walk-ins to fill gaps created by early finishes or no-shows."
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
    "patient_id" uuid NOT NULL REFERENCES "public"."patients"("id") ON DELETE CASCADE,
    "doctor_id" uuid REFERENCES "public"."doctors"("id") ON DELETE SET NULL,
    "department_id" uuid REFERENCES "public"."departments"("id") ON DELETE SET NULL,
    "slot_date" date NOT NULL,
    "slot_time" time NOT NULL,
    "slot_duration_mins" integer NOT NULL DEFAULT 15,
    "status" text NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED','CONFIRMED','CHECKED_IN','COMPLETED','NO_SHOW','CANCELLED'
    "appointment_type" text NOT NULL DEFAULT 'OPD', -- 'OPD','FOLLOWUP','LAB','PROCEDURE'
    "notes" text,
    "visit_id" uuid REFERENCES "public"."clinical_visits"("id") ON DELETE SET NULL, -- Linked once patient arrives
    "is_virtual_hold" boolean DEFAULT true, -- Reserved slot, not yet physically confirmed
    "source" text DEFAULT 'WHATSAPP', -- 'WHATSAPP','WALK_IN','PHONE','WEBSITE'
    "reminder_sent_24h" boolean DEFAULT false,
    "reminder_sent_1h" boolean DEFAULT false,
    "no_show_probability" numeric(5,4) DEFAULT 0.25, -- Default 25% based on industry data
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    -- Prevent double booking same doctor/slot
    UNIQUE ("doctor_id", "slot_date", "slot_time")
);

CREATE INDEX IF NOT EXISTS "idx_appointments_clinic_date" ON "public"."appointments" ("clinic_id", "slot_date", "status");
CREATE INDEX IF NOT EXISTS "idx_appointments_patient" ON "public"."appointments" ("patient_id", "slot_date");
CREATE INDEX IF NOT EXISTS "idx_appointments_doctor_date" ON "public"."appointments" ("doctor_id", "slot_date");

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Appointments isolated by clinic" ON "public"."appointments";
CREATE POLICY "Appointments isolated by clinic" ON "public"."appointments"
FOR ALL USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);


-- =================================================================================
-- 3. RATINGS TABLE (Post-visit rating + feedback)
-- Sibtain.md: Digital feedback mechanisms mandated by NABH Digital Health Standards
-- =================================================================================
CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL REFERENCES "public"."clinical_visits"("id") ON DELETE CASCADE,
    "clinic_id" uuid NOT NULL,
    "patient_id" uuid REFERENCES "public"."patients"("id") ON DELETE SET NULL,
    "doctor_id" uuid REFERENCES "public"."doctors"("id") ON DELETE SET NULL,
    "overall_score" integer NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
    "wait_time_score" integer CHECK (wait_time_score BETWEEN 1 AND 5),
    "doctor_score" integer CHECK (doctor_score BETWEEN 1 AND 5),
    "staff_score" integer CHECK (staff_score BETWEEN 1 AND 5),
    "facility_score" integer CHECK (facility_score BETWEEN 1 AND 5),
    "comment" text,
    "source" text DEFAULT 'WHATSAPP', -- 'WHATSAPP','KIOSK','WEB','SMS'
    "would_recommend" boolean,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("visit_id") -- One rating per visit
);

CREATE INDEX IF NOT EXISTS "idx_ratings_clinic_date" ON "public"."ratings" ("clinic_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ratings_doctor" ON "public"."ratings" ("doctor_id", "created_at" DESC);

ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ratings isolated by clinic" ON "public"."ratings";
CREATE POLICY "Ratings isolated by clinic" ON "public"."ratings"
FOR ALL USING (
    clinic_id IN (SELECT business_id FROM public.staff_users WHERE id = auth.uid())
);


-- =================================================================================
-- 4. LAB RETURN AUTO-PRIORITY RPC (Token Continuity)
-- Sibtain.md L127: "When a patient returns from the lab with a report, the system
--   automatically places them back into the doctor's queue with a higher priority
--   (often marked as 'Report Review') so they don't have to wait through a full queue again."
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_lab_return_requeue(
    p_visit_id uuid,
    p_session_id uuid,
    p_actor_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_visit record;
    v_new_score integer;
BEGIN
    SELECT * INTO v_visit FROM public.clinical_visits WHERE id = p_visit_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Visit not found');
    END IF;

    IF v_visit.status NOT IN ('SERVED', 'CANCELLED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Visit is still active');
    END IF;

    -- Calculate elevated score for lab returnee: LAB_RETURN base (200) + starvation guard
    v_new_score := public.rpc_calculate_priority_score('LAB_RETURN', true, 30, 0);

    UPDATE public.clinical_visits SET
        status = 'WAITING',
        previous_status = v_visit.status,
        visit_type_v2 = 'LAB_RETURN',
        priority_score = v_new_score,
        is_priority = true,
        updated_at = NOW()
    WHERE id = p_visit_id;

    -- Log the requeue event
    INSERT INTO public.queue_events (visit_id, clinic_id, event_type, from_status, to_status, actor_id, actor_type, metadata)
    VALUES (p_visit_id, v_visit.clinic_id, 'LAB_RETURN_REQUEUE', v_visit.status, 'WAITING', p_actor_id, 'SYSTEM',
        jsonb_build_object('new_priority_score', v_new_score, 'visit_type', 'LAB_RETURN'));

    RETURN jsonb_build_object('success', true, 'new_score', v_new_score, 'status', 'WAITING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =================================================================================
-- 5. SLOT AVAILABILITY API HELPER (GET /v1/slots/availability equivalent)
-- Sibtain.md L135: "the bot calls an internal API (GET /v1/slots/availability)
--   to verify the slot is still open."
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_available_slots(
    p_clinic_id uuid,
    p_doctor_id uuid,
    p_date date
) RETURNS jsonb AS $$
DECLARE
    v_booked_slots jsonb;
    v_available jsonb := '[]'::jsonb;
    slot_hour integer;
    slot_time time;
    is_booked boolean;
BEGIN
    -- Get all booked slots for this doctor on this date
    SELECT jsonb_agg(slot_time::text) INTO v_booked_slots
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND slot_date = p_date
      AND status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN');

    -- Generate 15-minute slots from 9:00 AM to 5:00 PM (Indian OPD standard)
    FOR slot_hour IN 9..16 LOOP
        FOR step IN 0..3 LOOP
            slot_time := (slot_hour || ':' || (step * 15)::text || ':00')::time;
            is_booked := (v_booked_slots IS NOT NULL AND v_booked_slots ? slot_time::text);

            IF NOT is_booked THEN
                v_available := v_available || jsonb_build_object(
                    'time', slot_time,
                    'available', true
                );
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'doctor_id', p_doctor_id,
        'date', p_date,
        'slots', v_available
    );
END;
$$ LANGUAGE plpgsql;


-- =================================================================================
-- 6. NO-SHOW PROBABILITY SCORER (Updates on appointment completion)
-- Sibtain.md: "dramatically reduces no-show rates by delivering automated
--   24-hour and 1-hour reminders"
-- Implements basic scoring logic to update no_show_probability on appointments
-- =================================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_noshowprob(p_appointment_id uuid)
RETURNS void AS $$
DECLARE
    v_appt record;
    v_patient_noshows integer;
    v_patient_total integer;
    v_dept_avg_noshow numeric;
    new_prob numeric;
BEGIN
    SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Count historical no-shows for this patient
    SELECT
        COUNT(*) FILTER (WHERE status = 'NO_SHOW'),
        COUNT(*)
    INTO v_patient_noshows, v_patient_total
    FROM public.appointments
    WHERE patient_id = v_appt.patient_id;

    -- Weighted probability: 70% patient history + 30% dept baseline (25%)
    IF v_patient_total > 0 THEN
        new_prob := 0.7 * (v_patient_noshows::numeric / v_patient_total) + 0.3 * 0.25;
    ELSE
        new_prob := 0.25; -- Default 25% for new patients (industry standard)
    END IF;

    UPDATE public.appointments SET no_show_probability = new_prob WHERE id = p_appointment_id;
END;
$$ LANGUAGE plpgsql;
