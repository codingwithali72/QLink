import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60 // 1 minute max for cron

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization')
    // Secure cron with a secret
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const supabase = createAdminClient()

    // 1. Fetch pending alerts
    const { data: alerts, error } = await supabase
        .from('whatsapp_alerts_queue')
        .select('*')
        .eq('status', 'PENDING')
        .limit(50)

    if (error || !alerts || alerts.length === 0) {
        return new NextResponse('No pending alerts', { status: 200 })
    }

    // Mark as processing to prevent duplicate processing
    const alertIds = alerts.map(a => a.id)
    await supabase
        .from('whatsapp_alerts_queue')
        .update({ status: 'PROCESSING' })
        .in('id', alertIds)

    for (const alert of alerts) {
        try {
            let phoneNumber = alert.phone_number;

            // DPDP Fix: Resolve phone from clinical_visits -> patients
            if (!phoneNumber && (alert.visit_id || alert.token_id)) {
                const { data: visitRow } = await supabase
                    .from('clinical_visits')
                    .select('patients(phone, phone_encrypted)')
                    .eq('id', alert.visit_id || alert.token_id)
                    .maybeSingle();

                const patient = visitRow?.patients as { phone_encrypted?: string, phone?: string } | null;
                if (patient) {
                    if (patient.phone_encrypted) {
                        const { decryptPhone } = await import('@/lib/crypto');
                        phoneNumber = decryptPhone(patient.phone_encrypted);
                    } else {
                        phoneNumber = patient.phone;
                    }
                }
            }

            if (!phoneNumber) {
                console.error("Missing phone number for alert", alert.id);
                await supabase.from('whatsapp_alerts_queue').update({ status: 'FAILED' }).eq('id', alert.id);
                continue;
            }

            // Check 24hr conversation window
            // Look into both tables for safety
            const { data: conv } = await supabase
                .from('conversations')
                .select('last_message_at')
                .eq('phone_number', phoneNumber)
                .maybeSingle();

            const { data: waConv } = await supabase
                .from('whatsapp_conversations')
                .select('last_interaction')
                .eq('phone', phoneNumber)
                .maybeSingle();

            const lastInteraction = conv?.last_message_at || waConv?.last_interaction;
            let isWithin24h = false;
            if (lastInteraction) {
                const hoursSinceMessage = (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60);
                isWithin24h = hoursSinceMessage <= 24;
            }

            let messageText = "";
            let templateName = "";

            if (alert.event_type === 'NEAR_TURN') {
                messageText = "You are 5 patients away from your consultation. Please stay nearby.";
                templateName = "qlink_near_turn";
            } else if (alert.event_type === 'NEXT_IN_LINE') {
                messageText = "You are NEXT. Please be ready.";
                templateName = "qlink_next_in_line";
            } else if (alert.event_type === 'SERVING') {
                messageText = "It’s Your Turn! Your token is now being served. Please proceed to the consultation room.";
                templateName = "qlink_now_serving";
            } else if (alert.event_type === 'DELAYED') {
                messageText = "Doctor is delayed by approximately 15 minutes. Updated estimated wait: 40 minutes.";
                templateName = "qlink_delay_update";
            } else if (alert.event_type === 'QUEUE_UPDATE') {
                messageText = "Queue Update: Your turn is approaching faster than expected.";
            }

            let success = false;
            if (isWithin24h) {
                if (alert.event_type === 'NEAR_TURN') {
                    success = await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "🚩 Almost Your Turn\n\nYou are 5 patients away from your consultation. Please stay nearby.",
                        [
                            { id: 'IM_ON_THE_WAY', title: 'I Am On The Way' },
                            { id: 'CANCEL_START', title: 'Cancel My Token' }
                        ]
                    );
                } else if (alert.event_type === 'NEXT_IN_LINE') {
                    success = await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "🔔 Almost Your Turn\n\nYou are NEXT. Please be ready.",
                        [
                            { id: 'IM_HERE', title: "I Am Here" }
                        ]
                    );
                } else if (alert.event_type === 'SERVING') {
                    success = await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "🟢 It’s Your Turn\n\nYour token is now being served. Please proceed to the consultation room.",
                        [
                            { id: 'IM_COMING', title: 'I Am Coming' },
                            { id: 'CANCEL_START', title: 'Cancel' }
                        ]
                    );
                } else if (alert.event_type === 'DELAYED') {
                    success = await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "⏳ Schedule Update\n\nDoctor is delayed by approximately 15 minutes.\n\nWe appreciate your patience.",
                        [
                            { id: 'KEEP_TOKEN', title: 'Keep My Token' },
                            { id: 'CANCEL_START', title: 'Cancel My Token' }
                        ]
                    );
                } else if (alert.event_type === 'ARRIVAL_PROMPT') {
                    success = await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "📍 Check-in Reminder\n\nYou are just 3 patients away. Have you arrived at the clinic yet?",
                        [
                            { id: 'IM_HERE', title: "I Am Here" },
                            { id: 'VIEW_STATUS', title: "View Position" }
                        ]
                    );
                } else if (alert.event_type === 'QUEUE_UPDATE') {
                    success = await sendWhatsAppFreeText(phoneNumber, "📢 Queue Update\n\nSomeone ahead was skipped. You are moving up faster!");
                } else if (alert.event_type === 'FEEDBACK_REQUEST') {
                    await supabase.from('whatsapp_conversations').upsert({
                        clinic_id: alert.business_id,
                        phone: phoneNumber,
                        state: 'AWAITING_FEEDBACK_RATING',
                        active_visit_id: alert.visit_id || alert.token_id,
                        last_interaction: new Date().toISOString()
                    }, { onConflict: 'clinic_id,phone' });

                    success = await sendWhatsAppInteractiveList(
                        phoneNumber,
                        "🙏 Thank you for visiting us.\n\nHow was your experience today?",
                        "Rate Us",
                        [
                            { id: 'RATE_5', title: '⭐⭐⭐⭐⭐ 5', description: 'Excellent' },
                            { id: 'RATE_4', title: '⭐⭐⭐⭐ 4', description: 'Good' },
                            { id: 'RATE_3', title: '⭐⭐⭐ 3', description: 'Average' },
                            { id: 'RATE_2', title: '⭐⭐ 2', description: 'Poor' },
                            { id: 'RATE_1', title: '⭐ 1', description: 'Very Poor' }
                        ]
                    );
                } else {
                    success = await sendWhatsAppFreeText(phoneNumber, messageText);
                }
            } else {
                if (alert.event_type !== 'FEEDBACK_REQUEST') {
                    success = await sendWhatsAppTemplate(phoneNumber, templateName);
                } else {
                    success = true;
                }
            }

            if (success) {
                await supabase.from('message_logs').insert({
                    business_id: alert.business_id,
                    phone_number: phoneNumber,
                    visit_id: alert.visit_id || alert.token_id,
                    message_type: alert.event_type,
                    delivery_status: 'sent'
                });
                await supabase.from('whatsapp_alerts_queue').update({ status: 'COMPLETED' }).eq('id', alert.id);
            } else {
                await supabase.from('whatsapp_alerts_queue').update({ status: 'FAILED' }).eq('id', alert.id);
            }
        } catch (e) {
            console.error("Error processing alert", alert.id, e);
            await supabase.from('whatsapp_alerts_queue').update({ status: 'FAILED' }).eq('id', alert.id);
        }
    }

    return new NextResponse(`Processed ${alerts.length} alerts`, { status: 200 });
}

async function sendWhatsAppFreeText(phone: string, text: string): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;
    if (!WABA_ID || !TOKEN) return false;

    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${phone}`,
                type: 'text',
                text: { body: text }
            })
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function sendWhatsAppTemplate(phone: string, templateName: string): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;
    if (!WABA_ID || !TOKEN) return false;

    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${phone}`,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en' }
                }
            })
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function sendWhatsAppInteractiveButtons(phone: string, bodyText: string, buttons: { id: string, title: string }[]): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;
    if (!WABA_ID || !TOKEN) return false;

    try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: `91${phone}`,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: bodyText },
                    action: {
                        buttons: buttons.map(b => ({
                            type: "reply",
                            reply: {
                                id: b.id,
                                title: b.title.substring(0, 20)
                            }
                        }))
                    }
                }
            }),
        });
        return res.ok;
    } catch (e) {
        console.error("Failed to send WA message", e);
        return false;
    }
}

async function sendWhatsAppInteractiveList(phone: string, bodyText: string, listTitle: string, options: { id: string, title: string, description?: string }[]): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;
    if (!WABA_ID || !TOKEN) return false;

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: `91${phone}`,
                type: "interactive",
                interactive: {
                    type: "list",
                    body: { text: bodyText },
                    action: {
                        button: listTitle.substring(0, 20),
                        sections: [
                            {
                                title: "Options",
                                rows: options.map(o => ({
                                    id: o.id,
                                    title: o.title.substring(0, 24),
                                    description: o.description ? o.description.substring(0, 72) : undefined
                                }))
                            }
                        ]
                    }
                }
            }),
        });
        return response.ok;
    } catch (error) {
        console.error("WhatsApp List Exception:", error);
        return false;
    }
}
