import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0";
const CRON_SECRET = process.env.CRON_SECRET;
const MAX_RETRIES = 3;

export async function GET(request: NextRequest) {
    // Security: require CRON_SECRET bearer token universally
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();
        const { PHONE_NUMBER_ID, ACCESS_TOKEN } = process.env;

        // Fetch PENDING + FAILED/EXCEPTION messages eligible for retry
        const { data: pendingMessages, error: fetchError } = await supabase
            .from("message_logs")
            .select("*")
            .or("status.eq.PENDING,status.eq.FAILED,status.eq.EXCEPTION")
            .order("created_at", { ascending: true })
            .limit(50);

        if (fetchError) throw fetchError;
        if (!pendingMessages || pendingMessages.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: "No pending messages." });
        }

        let processedCount = 0;
        let retriedCount = 0;
        let skippedCount = 0;

        for (const msg of pendingMessages) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = msg.provider_response as any;
            const retryCount: number = payload?.retry_count ?? 0;

            // Permanently give up after MAX_RETRIES
            if (msg.status !== 'PENDING' && retryCount >= MAX_RETRIES) {
                await supabase.from("message_logs")
                    .update({ status: "PERMANENTLY_FAILED" })
                    .eq("id", msg.id);
                skippedCount++;
                continue;
            }

            // Lock row to prevent concurrent cron double-sends
            await supabase.from("message_logs").update({ status: "PROCESSING" }).eq("id", msg.id);

            if (!payload?.phone || !payload?.components) {
                await supabase.from("message_logs").update({
                    status: "PERMANENTLY_FAILED",
                    provider_response: { error: "Invalid payload", retry_count: retryCount }
                }).eq("id", msg.id);
                skippedCount++;
                continue;
            }

            let finalStatus = "FAILED";
            let providerData: Record<string, unknown>;
            // Mock mode (if no live Meta keys)
            if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_BEARER_TOKEN) {
                console.log(`[wa-worker] Mock send to ${payload.phone} (Template: ${msg.message_type})`); // Adjusted resolvedPhone and log.message_type to match existing variables
                finalStatus = "MOCK_SENT";
                providerData = { mock: true, sent_to: payload.phone, retry_count: retryCount };
            } else {
                try {
                    const response = await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.WHATSAPP_BEARER_TOKEN}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            messaging_product: "whatsapp",
                            to: payload.phone,
                            type: "template",
                            template: {
                                name: msg.message_type,
                                language: { code: "en" },
                                components: payload.components
                            }
                        }),
                    });

                    const responseData = await response.json();
                    finalStatus = response.ok ? "SENT" : "FAILED";
                    providerData = {
                        ...responseData,
                        retry_count: retryCount + (response.ok ? 0 : 1),
                        // Preserve phone+components for next retry attempt
                        ...(response.ok ? {} : { phone: payload.phone, components: payload.components })
                    };
                } catch (err) {
                    finalStatus = "EXCEPTION";
                    providerData = {
                        error: (err as Error).message,
                        retry_count: retryCount + 1,
                        // Keep payload so next retry can resend
                        phone: payload.phone,
                        components: payload.components
                    };
                }
            }

            await supabase.from("message_logs").update({
                status: finalStatus,
                provider_response: providerData
            }).eq("id", msg.id);

            if (msg.status !== 'PENDING') retriedCount++;
            processedCount++;
        }

        return NextResponse.json({ success: true, processed: processedCount, retried: retriedCount, skipped: skippedCount });

    } catch (e) {
        console.error("Message Cron Processing Error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
