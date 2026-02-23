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

        // 3. Process each message — decrypts phone from tokens table (DPDP compliant)
        for (const log of pendingLogs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = log.provider_response as { components?: any[], token_id?: string, phone_hash?: string, phone?: string };
            if (!payload || !payload.components) {
                await supabase.from('message_logs').update({ status: 'FAILED' }).eq('id', log.id);
                failCount++;
                continue;
            }

            // DPDP: Resolve phone from encrypted tokens table, not from JSONB payload
            // Supports both new (token_id lookup) and legacy (direct phone) payloads
            let resolvedPhone: string | null = null;
            const lookupTokenId = payload.token_id || log.token_id;

            if (lookupTokenId) {
                try {
                    const { data: tokenRow } = await supabase
                        .from('tokens')
                        .select('patient_phone_encrypted, patient_phone')
                        .eq('id', lookupTokenId)
                        .maybeSingle();

                    if (tokenRow?.patient_phone_encrypted) {
                        resolvedPhone = decryptPhone(tokenRow.patient_phone_encrypted);
                    } else if (tokenRow?.patient_phone) {
                        // Legacy plaintext fallback (for tokens created before encryption)
                        resolvedPhone = tokenRow.patient_phone;
                    }
                } catch (decryptErr) {
                    console.error(`[wa-worker] Failed to decrypt phone for token ${lookupTokenId}:`, decryptErr);
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
                // sendWhatsApp internally updates status = SENT / FAILED based on response.
                await sendWhatsApp(
                    resolvedPhone,
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
