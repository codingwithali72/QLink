import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Vercel Cron Secret for Authorization (Optional but recommended)
const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    // 1. Validate Cron Request
    const authHeader = req.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // 2. Fetch pending jobs
    // Grab jobs that are pending and whose next_retry_at is in the past
    // Limit to 10 to prevent Vercel Serverless Function timeout (10s - 60s max)
    const { data: jobs, error: fetchError } = await supabase
        .from('whatsapp_retry_queue')
        .select(`
            id, 
            retry_count, 
            whatsapp_logs!inner (
                id, phone, template_name, payload, clinic_id, token_id
            )
        `)
        .eq('status', 'pending')
        .lte('next_retry_at', now)
        .order('next_retry_at', { ascending: true })
        .limit(10);

    if (fetchError) {
        console.error("Cron fetch error:", fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
        return NextResponse.json({ message: "No pending jobs" }, { status: 200 });
    }

    console.log(`[CRON] Found ${jobs.length} WhatsApp retry jobs.`);

    // 3. Mark jobs as processing
    await supabase.from('whatsapp_retry_queue')
        .update({ status: 'processing' })
        .in('id', jobs.map(j => j.id));

    // 4. Process Batch concurrently using Promise.allSettled
    const results = await Promise.allSettled(
        jobs.map(async (job) => {
            const waLog = Array.isArray(job.whatsapp_logs) ? job.whatsapp_logs[0] : job.whatsapp_logs;

            // Execute Dispatch (raw HTTP to avoid circular dependency loops with whatsapp-dispatch.ts wrapping)
            const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
            const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

            if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_ID) {
                throw new Error("Missing Meta Credentials");
            }

            const response = await fetch(`https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_ID}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(waLog.payload)
            });

            const data = await response.json();

            if (!response.ok) {
                // If Bad Request (400), don't retry again. It's a template error.
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    throw { status: response.status, message: data.error?.message || "Client Error", abandon: true };
                }
                throw { status: response.status, message: data.error?.message || "Server Error", abandon: false };
            }

            return { job, messageId: data.messages?.[0]?.id };
        })
    );

    // 5. Evaluate Results & Update DB
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const job = jobs[i];
        const waLog = Array.isArray(job.whatsapp_logs) ? job.whatsapp_logs[0] : job.whatsapp_logs;

        if (result.status === 'fulfilled') {
            successCount++;
            // Update Log to Sent
            await supabase.from('whatsapp_logs').update({
                status: 'sent',
                meta_message_id: result.value.messageId
            }).eq('id', waLog.id);

            // Update Queue to Completed
            await supabase.from('whatsapp_retry_queue').update({
                status: 'completed'
            }).eq('id', job.id);

        } else {
            failCount++;
            const reason = result.reason;
            const newRetryCount = job.retry_count + 1;

            // Exponential backoff: 1m, 5m, 15m, 60m... Max 4 retries.
            let nextStatus = 'pending';
            let nextRetryMs = 0;

            if (reason.abandon || newRetryCount > 4) {
                nextStatus = 'abandoned';
            } else {
                nextRetryMs = Date.now() + (Math.pow(4, newRetryCount) * 60000);
                // retry 1: 4m, retry 2: 16m, retry 3: 64m
            }

            await supabase.from('whatsapp_retry_queue').update({
                status: nextStatus,
                retry_count: newRetryCount,
                last_error: reason.message || String(reason),
                next_retry_at: nextStatus === 'pending' ? new Date(nextRetryMs).toISOString() : new Date().toISOString()
            }).eq('id', job.id);
        }
    }

    return NextResponse.json({
        message: `Processed ${jobs.length} jobs`,
        success: successCount,
        failed: failCount
    });
}
