"use server";

/**
 * app/actions/export.ts — Audited data export for clinic owners.
 *
 * DPDP compliance:
 * - Only clinic-owned data can be exported.
 * - Exports are logged in export_logs (immutable audit trail).
 * - Phone numbers are decrypted server-side only at export time.
 * - Receptionists can export but it is auditable by the clinic OWNER or SUPER_ADMIN.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decryptPhone } from "@/lib/crypto";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getStaffWithRole(supabaseAdmin: ReturnType<typeof createAdminClient>) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: staff } = await supabaseAdmin
        .from("staff_users")
        .select("id, business_id, role, name")
        .eq("id", user.id)
        .single();

    return staff;
}

// ── Export patient list ───────────────────────────────────────────────────────

export interface ExportRow {
    token_number: number;
    patient_name: string | null;
    patient_phone: string | null;   // decrypted, null if PII purged
    status: string;
    is_priority: boolean;
    created_at: string;
    served_at: string | null;
    source: string | null;
    rating: number | null;
    feedback: string | null;
}

export async function exportPatientList(
    clinicSlug: string,
    dateFrom: string,  // ISO date string: '2026-02-01'
    dateTo: string,    // ISO date string: '2026-02-24'
): Promise<{ data?: ExportRow[]; csv?: string; clinicName?: string; error?: string }> {
    const supabase = createAdminClient();

    // 1. Authenticate and check role
    const staff = await getStaffWithRole(supabase);
    if (!staff) return { error: "Unauthorized" };

    // 2. RBAC gate: OWNER, SUPER_ADMIN, RECEPTIONIST
    if (!["OWNER", "SUPER_ADMIN", "RECEPTIONIST"].includes(staff.role)) {
        return { error: "Access denied. Export requires OWNER, SUPER_ADMIN, or RECEPTIONIST role." };
    }

    // 3. Resolve the clinic and verify ownership
    const { data: business } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("slug", clinicSlug)
        .single();

    if (!business) return { error: "Clinic not found" };

    // Verify this staff belongs to this clinic (cross-clinic protection)
    if (staff.business_id !== business.id) {
        return { error: "Access denied. You can only export data for your own clinic." };
    }

    // 4. Fetch tokens in date range (via sessions)
    const { data: tokens, error: fetchErr } = await supabase
        .from("tokens")
        .select(`
            token_number,
            patient_name,
            patient_phone,
            patient_phone_encrypted,
            status,
            is_priority,
            rating,
            feedback,
            created_at,
            served_at,
            source,
            sessions!inner ( date )
        `)
        .eq("business_id", business.id)
        .gte("sessions.date", dateFrom)
        .lte("sessions.date", dateTo)
        .order("created_at", { ascending: true })
        .limit(1000); // Scalability Guard: Prevent server action timeout/OOM

    if (fetchErr) return { error: fetchErr.message };

    // 5. Decrypt phones (only at export time)
    const rows: ExportRow[] = (tokens || []).map((t) => {
        let phone: string | null = t.patient_phone || null;

        // Prefer encrypted field — decrypt if available
        if (t.patient_phone_encrypted) {
            try {
                phone = decryptPhone(t.patient_phone_encrypted);
            } catch {
                phone = "[decryption_error]";
            }
        }

        return {
            token_number: t.token_number,
            patient_name: t.patient_name,
            patient_phone: phone,
            status: t.status,
            is_priority: t.is_priority,
            created_at: t.created_at,
            served_at: t.served_at,
            source: t.source,
            rating: t.rating,
            feedback: t.feedback,
        };
    });

    // 6. Write export audit log BEFORE returning data
    await supabase.from("export_logs").insert({
        clinic_id: business.id,
        staff_id: staff.id,
        export_type: "csv_patient_list",
        record_count: rows.length,
        date_from: dateFrom,
        date_to: dateTo,
    });

    // 7. Also write to system_audit_logs
    await supabase.from("system_audit_logs").insert({
        clinic_id: business.id,
        actor_id: staff.id,
        actor_role: staff.role,
        action_type: "EXPORT_REQUESTED",
        entity_type: "token",
        metadata: {
            export_type: "csv_patient_list",
            record_count: rows.length,
            date_from: dateFrom,
            date_to: dateTo,
            staff_name: staff.name,
        },
    });

    // 8. Build CSV
    const headers = ["token_number", "patient_name", "patient_phone", "status", "is_priority", "created_at", "served_at", "source", "rating", "feedback"];
    const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
            [
                r.token_number,
                `"${(r.patient_name || "").replace(/"/g, '""')}"`,
                `"${(r.patient_phone || "").replace(/"/g, '""')}"`,
                r.status,
                r.is_priority,
                r.created_at,
                r.served_at || "",
                r.source || "",
                r.rating || "",
                `"${(r.feedback || "").replace(/"/g, '""')}"`
            ].join(",")
        ),
    ];

    return { data: rows, csv: csvLines.join("\n"), clinicName: business.name };
}

// ── Export audit logs (meta-audit) ────────────────────────────────────────────

export async function getExportHistory(clinicSlug: string) {
    const supabase = createAdminClient();

    const staff = await getStaffWithRole(supabase);
    if (!staff) return { error: "Unauthorized" };
    if (!["OWNER", "SUPER_ADMIN"].includes(staff.role)) {
        return { error: "Access denied" };
    }

    const { data: business } = await supabase
        .from("businesses")
        .select("id")
        .eq("slug", clinicSlug)
        .single();

    if (!business || staff.business_id !== business.id) {
        return { error: "Access denied" };
    }

    const { data, error } = await supabase
        .from("export_logs")
        .select("id, export_type, record_count, date_from, date_to, created_at, staff_id")
        .eq("clinic_id", business.id)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error) return { error: error.message };
    return { data };
}
