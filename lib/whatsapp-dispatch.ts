import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

interface TemplateVariable {
    type: "text";
    text: string;
}

interface DispatchProps {
    to: string;
    templateName: string;
    variables: TemplateVariable[];
    clinicId: string;
    tokenId?: string | null;
}

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_API_VERSION = 'v22.0';

/**
 * Normalizes an Indian phone number to E.164 without the '+' prefix (e.g., 919320201571).
 */
function normalizeToE164(phone: string): string | null {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 10) return `91${clean}`;
    if (clean.length === 12 && clean.startsWith('91')) return clean;
    return null;
}

/**
 * Core Engine: Dispatches WhatsApp Utility Templates and logs output.
 * Ensures strict auditing and idempotency for Token/Joined events.
 */
export async function sendWhatsAppUtilityTemplate({
    to,
    templateName,
    variables,
    clinicId,
    tokenId = null
}: DispatchProps): Promise<{ success: boolean; error?: string; messageId?: string }> {

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_ID) {
        console.error("Missing WhatsApp Edge Config.");
        return { success: false, error: "Configuration Error" };
    }

    const formattedPhone = normalizeToE164(to);
    if (!formattedPhone) {
        return { success: false, error: "Invalid Indian mobile number" };
    }

    // Phase 8: Max 3 token confirmations per 10 mins per phone
    const rateLimit = checkRateLimit(`wa_dispatch_${formattedPhone}`, 3, 10 * 60 * 1000);
    if (!rateLimit.success) {
        console.warn(`[WA Dispatch] Rate limit hit for ${formattedPhone}`);
        return { success: false, error: "Rate limit exceeded" };
    }

    const supabase = createAdminClient();

    const payload = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
            name: templateName,
            language: { code: "en" },
            components: [
                {
                    type: "body",
                    parameters: variables
                }
            ]
        }
    };

    try {
        const response = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`Meta API Error [${response.status}]:`, data);
            const errorMsg = data.error?.message || "Unknown Meta Error";

            // Log failure
            const { data: logEntry } = await supabase.from('whatsapp_logs').insert({
                clinic_id: clinicId,
                token_id: tokenId,
                phone: formattedPhone,
                template_name: templateName,
                payload: payload,
                status: 'failed',
                error_message: errorMsg
            }).select('id').single();

            // Insert to retry queue for 500s or timeouts, but NOT 400s (Bad Request like Invalid Template)
            if (response.status >= 500 && logEntry?.id) {
                await supabase.from('whatsapp_retry_queue').insert({
                    log_id: logEntry.id,
                    clinic_id: clinicId,
                    next_retry_at: new Date(Date.now() + 60000).toISOString() // Retry in 1 minute
                });
            }

            return { success: false, error: errorMsg };
        }

        const messageId = data.messages?.[0]?.id || "unknown";

        // Log Success
        await supabase.from('whatsapp_logs').insert({
            clinic_id: clinicId,
            token_id: tokenId,
            phone: formattedPhone,
            template_name: templateName,
            payload: payload,
            meta_message_id: messageId,
            status: 'sent'
        });

        return { success: true, messageId };

    } catch (e: any) {
        console.error("WhatsApp Dispatch Logic Exception:", e);

        const { data: logEntry } = await supabase.from('whatsapp_logs').insert({
            clinic_id: clinicId,
            token_id: tokenId,
            phone: formattedPhone,
            template_name: templateName,
            payload: payload,
            status: 'failed',
            error_message: e.message || "Network Timeout"
        }).select('id').single();

        if (logEntry?.id) {
            await supabase.from('whatsapp_retry_queue').insert({
                log_id: logEntry.id,
                clinic_id: clinicId,
                next_retry_at: new Date(Date.now() + 60000).toISOString() // Retry in 1m
            });
        }

        return { success: false, error: e.message };
    }
}
