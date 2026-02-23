import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp';

// Vercel Cron or Edge trigger to flush PENDING messages
export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${cronSecret}`) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createAdminClient();

        // 1. Fetch up to 50 pending messages
        const { data: pendingLogs, error: fetchErr } = await supabase
            .from('message_logs')
            .select('id, business_id, token_id, message_type, provider_response')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true })
            .limit(50);

        if (fetchErr) throw fetchErr;
        if (!pendingLogs || pendingLogs.length === 0) {
            return NextResponse.json({ success: true, message: 'No pending messages' });
        }

        // 2. Mark them as PROCESSING to prevent duplicate sends if cron overlaps
        const ids = pendingLogs.map(l => l.id);
        await supabase
            .from('message_logs')
            .update({ status: 'PROCESSING' })
            .in('id', ids);

        let successCount = 0;
        let failCount = 0;

        // 3. Process each message (Awaited sequentially to respect Meta rate limits safely, but scalable off UI thread)
        for (const log of pendingLogs) {
            const payload = log.provider_response as { phone?: string, components?: any[] };
            if (!payload || !payload.phone || !payload.components) {
                await supabase.from('message_logs').update({ status: 'FAILED' }).eq('id', log.id);
                failCount++;
                continue;
            }

            try {
                // sendWhatsApp internally updates status = SENT / FAILED based on response.
                await sendWhatsApp(
                    payload.phone,
                    log.message_type,
                    payload.components,
                    log.business_id,
                    log.token_id || undefined
                );
                successCount++;
            } catch (err) {
                console.error(`Failed to send WA message for log ${log.id}`, err);
                await supabase.from('message_logs').update({ status: 'FAILED' }).eq('id', log.id);
                failCount++;
            }
        }

        return NextResponse.json({ success: true, processed: pendingLogs.length, successCount, failCount });
    } catch (e) {
        console.error("Cron WA Worker Error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
