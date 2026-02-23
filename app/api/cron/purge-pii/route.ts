import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/purge-pii
 *
 * Vercel cron job — scheduled at 20:30 UTC = 02:00 IST daily.
 * Calls the purge_expired_pii() SQL function which nullifies name + phone
 * on tokens older than each clinic's retention_days (default 30).
 *
 * Protection: CRON_SECRET header must match env var.
 * This prevents public invocation; only Vercel's cron runner sends the secret.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;

    // Verify Vercel cron secret (set in Vercel env + vercel.json)
    const authHeader = req.headers.get("authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    try {
        const { data, error } = await supabase.rpc("purge_expired_pii");

        if (error) {
            console.error("[cron/purge-pii] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log("[cron/purge-pii] Complete:", data);
        return NextResponse.json({ success: true, result: data });
    } catch (err) {
        console.error("[cron/purge-pii] Fatal:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
