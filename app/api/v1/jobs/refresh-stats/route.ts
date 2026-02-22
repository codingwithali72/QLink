import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClinicDate } from '@/lib/date';

// Endpoint intended to be called by a CRON job (e.g., Vercel Cron)
// It precalculates and aggregates daily token statistics for all clinics.
// This scales the Admin Dashboard indefinitely without doing expensive realtime JOIN aggregations.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        // Basic security: require a cron secret if running in production
        const authHeader = req.headers.get('authorization');
        const expectedSecret = process.env.CRON_SECRET;

        // If CRON_SECRET is defined locally or in Vercel, mandate it
        if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createAdminClient();
        const dateStr = getClinicDate();

        const { error } = await supabase.rpc('refresh_clinic_daily_stats', {
            p_date: dateStr
        });

        if (error) {
            console.error('Failed to run refresh_clinic_daily_stats:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, date: dateStr, message: 'Analytics aggregation successful.' });
    } catch (e) {
        console.error('Cron job failure:', e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
