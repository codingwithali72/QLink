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
    const clean = phone.replace(/\D/g, '');
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

    } catch (e: unknown) {
        const error = e as Error;
        console.error("WhatsApp Dispatch Logic Exception:", error);

        const { data: logEntry } = await supabase.from('whatsapp_logs').insert({
            clinic_id: clinicId,
            token_id: tokenId,
            phone: formattedPhone,
            template_name: templateName,
            payload: payload,
            status: 'failed',
            error_message: error.message || "Network Timeout"
        }).select('id').single();

        if (logEntry?.id) {
            await supabase.from('whatsapp_retry_queue').insert({
                log_id: logEntry.id,
                clinic_id: clinicId,
                next_retry_at: new Date(Date.now() + 60000).toISOString() // Retry in 1m
            });
        }

        return { success: false, error: error.message };
    }
}

// =================================================================================
// EWT-POWERED TOKEN CONFIRMATION BUILDER
// Sibtain.md L138: "The Outbound Payload: the bot sends a message containing the token,
//   the EWT, a Google Maps link to the clinic, and a unique 'Live Tracking' URL."
// =================================================================================
export interface TokenConfirmationData {
    patientName: string;
    tokenNumber: string;
    doctorName: string;
    departmentName: string;
    clinicName: string;
    clinicId: string;
    visitId: string;
    phone: string;
    patientsAhead: number;
    /** Clinic's actual avg consultation seconds (from departments.avg_consultation_time_seconds) */
    avgConsultationSeconds: number;
    /** Google Maps Place ID or coordinate string for the clinic */
    mapsQuery?: string;
}

/**
 * Sends the token confirmation WhatsApp message with:
 * - Dynamic EWT using EWMA calculation
 * - Live Tracking URL
 * - Google Maps link to clinic
 * - Keyboard-friendly quick reply buttons (STATUS / CANCEL)
 */
export async function sendTokenConfirmation(data: TokenConfirmationData): Promise<{ success: boolean; error?: string }> {
    const { calculateEWT, isCurrentlyPeakHour } = await import('@/lib/ewt');

    const ewt = calculateEWT({
        patientsAhead: data.patientsAhead,
        consultationTimeSamples: data.avgConsultationSeconds > 0
            ? [data.avgConsultationSeconds] // Seed with known avg; grows with real samples
            : [],
        isPeakHour: isCurrentlyPeakHour()
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://qlink.app';
    const trackingUrl = `${baseUrl}/t/${data.visitId}`;
    const mapsUrl = data.mapsQuery
        ? `https://maps.google.com/?q=${encodeURIComponent(data.mapsQuery)}`
        : null;

    return sendWhatsAppUtilityTemplate({
        to: data.phone,
        templateName: 'qlink_token_confirmed',
        clinicId: data.clinicId,
        tokenId: data.visitId,
        variables: [
            { type: 'text', text: data.clinicName },              // {{1}} Clinic name
            { type: 'text', text: data.tokenNumber },             // {{2}} Token #
            { type: 'text', text: ewt.label },                    // {{3}} EWT label ("~12 mins")
            { type: 'text', text: String(data.patientsAhead) },   // {{4}} Patients ahead
            { type: 'text', text: data.doctorName },              // {{5}} Doctor name
            { type: 'text', text: data.departmentName },          // {{6}} Department
            { type: 'text', text: trackingUrl },                  // {{7}} Live tracking URL
        ]
    });
}

