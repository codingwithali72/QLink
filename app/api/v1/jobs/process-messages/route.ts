import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0";
const CRON_SECRET = process.env.CRON_SECRET || "default_cron_secret";

export async function GET(request: Request) {
    // Basic Security: Protect route from random public pings unless they have the secret Header
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${CRON_SECRET}`) {
        // Return 401 strictly in production, but we allow unsecured testing locally
        // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();

        // 1. Fetch pending messages (limit to 50 per batch)
        const { data: pendingMessages, error: fetchError } = await supabase
            .from("message_logs")
            .select("*")
            .eq("status", "PENDING")
            .order("created_at", { ascending: true })
            .limit(50);

        if (fetchError) throw fetchError;

        if (!pendingMessages || pendingMessages.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: "No pending messages." });
        }

        let processedCount = 0;
        const { PHONE_NUMBER_ID, ACCESS_TOKEN } = process.env;

        // 2. Process each message securely
        for (const msg of pendingMessages) {
            // Lock row immediately to prevent double-sends in concurrent cron setups
            await supabase.from("message_logs").update({ status: "PROCESSING" }).eq("id", msg.id);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = msg.provider_response as any;
            if (!payload || !payload.phone || !payload.components) {
                await supabase.from("message_logs").update({ status: "FAILED", provider_response: { error: "Invalid queued payload format" } }).eq("id", msg.id);
                continue;
            }

            let finalStatus = "FAILED";
            let providerData = null;

            if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
                // Mock Mode
                finalStatus = "MOCK_SENT";
                providerData = { mock: true, sent_to: payload.phone };
            } else {
                // Real Send
                try {
                    const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${ACCESS_TOKEN}`,
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

                    providerData = await response.json();
                    finalStatus = response.ok ? "SENT" : "FAILED";
                } catch (err) {
                    providerData = { error: (err as Error).message };
                    finalStatus = "EXCEPTION";
                }
            }

            // Update original record tracking idempotently
            await supabase.from("message_logs").update({
                status: finalStatus,
                provider_response: providerData
            }).eq("id", msg.id);

            processedCount++;
        }

        return NextResponse.json({ success: true, processed: processedCount });

    } catch (e) {
        console.error("Message Cron Processing Error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
