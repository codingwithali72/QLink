import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp';
import { decryptPhone } from '@/lib/crypto';

// Vercel Cron or Edge trigger to flush PENDING messages
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Always enforce CRON_SECRET when it's set (not just in production)
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createAdminClient();

        // 1. Fetch up to 50 pending messages
        const { data: pendingLogs, error: fetchErr } = await supabase
            .from('message_logs')
            .select('id, business_id, visit_id, message_type, provider_response')
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

        // 3. Process each message — decrypts phone from tokens table (DPDP compliant)
        for (const log of pendingLogs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = log.provider_response as { components?: any[], visit_id?: string, phone_hash?: string, phone?: string };
            if (!payload || !payload.components) {
                await supabase.from('message_logs').update({ status: 'FAILED' }).eq('id', log.id);
                failCount++;
                continue;
            }

            // DPDP: Resolve phone from encrypted tokens table, not from JSONB payload
            // Supports both new (token_id lookup) and legacy (direct phone) payloads
            let resolvedPhone: string | null = null;
            // DPDP: Resolve phone from patients table (linked to clinical_visits)
            const lookupVisitId = payload.visit_id || log.visit_id;

            if (lookupVisitId) {
                try {
                    const { data: visitRow } = await supabase
                        .from('clinical_visits')
                        .select('patients(phone_encrypted, phone)')
                        .eq('id', lookupVisitId)
                        .maybeSingle();

                    const visitRecord = visitRow as unknown as { patients: { phone_encrypted?: string, phone?: string } | null };
                    const patient = visitRecord?.patients;

                    if (patient?.phone_encrypted) {
                        resolvedPhone = decryptPhone(patient.phone_encrypted);
                    } else if (patient?.phone) {
                        resolvedPhone = patient.phone;
                    }
                } catch (decryptErr) {
                    console.error(`[wa-worker] Failed to resolve phone for visit ${lookupVisitId}:`, decryptErr);
                }
            }

            // Last-resort: direct phone in payload (legacy support — will be removed once all rows migrated)
            if (!resolvedPhone && payload.phone) {
                resolvedPhone = payload.phone;
            }

            if (!resolvedPhone) {
                await supabase.from('message_logs').update({ status: 'FAILED' }).eq('id', log.id);
                failCount++;
                continue;
            }

            try {
                await sendWhatsApp(
                    resolvedPhone,
                    log.message_type,
                    payload.components,
                    log.business_id,
                    (log as unknown as { visit_id?: string }).visit_id || undefined
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
