"use client";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Audit Trail Actions
 * Handles fetching immutable logs for clinical visits.
 */

export interface AuditEvent {
    id: string;
    action_type: string;
    timestamp: string;
    actor_id: string | null;
    metadata: unknown;
}

export async function getVisitTimeline(visitId: string) {
    if (!visitId) return { error: "Missing visit ID" };

    const supabase = createAdminClient();

    try {
        const { data, error } = await supabase
            .from('security_audit_logs')
            .select('*')
            .eq('record_id', visitId)
            .order('timestamp', { ascending: true });

        if (error) throw error;

        return { success: true, timeline: data as AuditEvent[] };
    } catch (e) {
        console.error("[Audit] Fetch error:", e);
        return { error: (e as Error).message };
    }
}
