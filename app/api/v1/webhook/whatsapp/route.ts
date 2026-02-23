import { NextResponse } from 'next/server';
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from 'crypto';

function verifyWhatsAppSignature(rawBody: string, signature: string | null): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret || !signature) return false;

    // Meta passes the signature as "sha256=..."
    const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody, 'utf-8')
        .digest('hex');

    return signature === `sha256=${expectedSignature}`;
}

export async function POST(req: Request) {
    try {
        // Must read raw text for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');

        if (!verifyWhatsAppSignature(rawBody, signature)) {
            console.error("Webhook Verification Failed: Invalid Signature");
            return new NextResponse("Invalid signature", { status: 401 });
        }

        const body = JSON.parse(rawBody);
        const supabase = createAdminClient();

        // 1. Process WhatsApp Webhook Payloads
        // Meta sends messaging statuses (sent, delivered, read, failed) here
        const entries = body.entry || [];
        for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
                if (change.value && change.value.statuses) {
                    for (const status of change.value.statuses) {
                        const messageId = status.id;
                        const deliveryStatus = status.status; // 'sent', 'delivered', 'read', 'failed'

                        // In a real production system, you would update the message_logs table 
                        // based on the provider_message_id = messageId
                        await supabase.from('message_logs')
                            .update({ status: deliveryStatus.toUpperCase() })
                            .eq('provider_response->>messages->>0->>id', messageId);
                    }
                }
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

// Meta Verification Endpoint
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Replace with your actual verify token
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            return new NextResponse(challenge, { status: 200 });
        } else {
            return new NextResponse("Forbidden", { status: 403 });
        }
    }
    return new NextResponse("Bad Request", { status: 400 });
}
