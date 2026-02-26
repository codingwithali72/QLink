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
            // Check 24hr conversation window
            const { data: conv } = await supabase
                .from('conversations')
                .select('last_message_at')
                .eq('phone_number', alert.phone_number)
                .single()

            let isWithin24h = false
            if (conv && conv.last_message_at) {
                const hoursSinceMessage = (Date.now() - new Date(conv.last_message_at).getTime()) / (1000 * 60 * 60)
                isWithin24h = hoursSinceMessage <= 24
            }

            // Phase 6: Cost Optimization Engine logic
            // Only send Token Created, 5 Left (NEAR_TURN), Now Serving (SERVING). DELAYED is also required per Phase 3.

            let messageText = ""
            let templateName = "" // Used if outside 24 hour window (Must pre-approve Utility template in Meta)

            if (alert.event_type === 'NEAR_TURN') {
                messageText = "Your turn is approaching! There are approximately 5 patients ahead of you. Please head to the waiting area."
                templateName = "qlink_near_turn" // Example template name
            } else if (alert.event_type === 'SERVING') {
                messageText = "The doctor is ready for you! Please proceed to the clinic room."
                templateName = "qlink_now_serving"
            } else if (alert.event_type === 'DELAYED') {
                messageText = "The doctor is delayed by approximately 15 mins. Thank you for your patience."
                templateName = "qlink_delay_update"
            }

            let success = false
            if (isWithin24h) {
                if (alert.event_type === 'NEAR_TURN') {
                    success = await sendWhatsAppInteractiveButtons(
                        alert.phone_number,
                        "🔔 Your turn is coming up!\n\nOnly 5 patients ahead of you.\n\nPlease reach the clinic in the next 10 minutes.",
                        [
                            { id: 'IM_ON_THE_WAY', title: "I'm On The Way" },
                            { id: 'CANCEL_TOKEN', title: 'Cancel My Token' }
                        ]
                    )
                } else if (alert.event_type === 'SERVING') {
                    success = await sendWhatsAppInteractiveButtons(
                        alert.phone_number,
                        "🟢 It's Your Turn!\n\nYour token is now being served.\n\nPlease proceed to reception.",
                        [
                            { id: 'IM_HERE', title: "I'm Here" }
                        ]
                    )
                } else if (alert.event_type === 'DELAYED') {
                    // Just informational
                    success = await sendWhatsAppFreeText(alert.phone_number, "The doctor is delayed by approximately 15 mins. Thank you for your patience.")
                } else if (alert.event_type === 'FEEDBACK_REQUEST') {
                    // Set conversation state to AWAITING_FEEDBACK_RATING
                    await supabase.from('whatsapp_conversations').upsert({
                        clinic_id: alert.business_id,
                        phone: alert.phone_number,
                        state: 'AWAITING_FEEDBACK_RATING',
                        active_token_id: alert.token_id,
                        last_interaction: new Date().toISOString()
                    }, { onConflict: 'clinic_id,phone' })

                    success = await sendWhatsAppInteractiveList(
                        alert.phone_number,
                        "🙏 Thank you for visiting us.\n\nHow was your experience today?",
                        "Rate Us",
                        [
                            { id: 'RATE_5', title: '⭐⭐⭐⭐⭐ 5', description: 'Excellent' },
                            { id: 'RATE_4', title: '⭐⭐⭐⭐ 4', description: 'Good' },
                            { id: 'RATE_3', title: '⭐⭐⭐ 3', description: 'Average' },
                            { id: 'RATE_2', title: '⭐⭐ 2', description: 'Poor' },
                            { id: 'RATE_1', title: '⭐ 1', description: 'Very Poor' }
                        ]
                    )
                } else {
                    success = await sendWhatsAppFreeText(alert.phone_number, messageText)
                }
            } else {
                // strict Utility Template outside 24h
                // For feedback outside 24h, you cannot easily start conversations. We'll skip or use standard template.
                if (alert.event_type !== 'FEEDBACK_REQUEST') {
                    success = await sendWhatsAppTemplate(alert.phone_number, templateName)
                } else {
                    success = true; // Skip feedback outside 24h to save costs and avoid template rejection
                }
            }

            if (success) {
                // Log the message for billing/auditing metrics
                await supabase.from('message_logs').insert({
                    business_id: alert.business_id,
                    phone_number: alert.phone_number,
                    token_id: alert.token_id,
                    message_type: alert.event_type,
                    delivery_status: 'sent'
                })

                await supabase.from('whatsapp_alerts_queue').update({ status: 'COMPLETED' }).eq('id', alert.id)
            } else {
                await supabase.from('whatsapp_alerts_queue').update({ status: 'FAILED' }).eq('id', alert.id)
            }

        } catch (e) {
            console.error("Error processing alert", alert.id, e)
            await supabase.from('whatsapp_alerts_queue').update({ status: 'FAILED' }).eq('id', alert.id)
        }
    }

    return new NextResponse(`Processed ${alerts.length} alerts`, { status: 200 })
}

// Simulated API calls to WhatsApp Cloud API
async function sendWhatsAppFreeText(phone: string, text: string): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
    if (!WABA_ID || !TOKEN) return false

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
        })
        return res.ok
    } catch {
        return false
    }
}

async function sendWhatsAppTemplate(phone: string, templateName: string): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
    if (!WABA_ID || !TOKEN) return false

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
        })
        return res.ok
    } catch {
        return false
    }
}

async function sendWhatsAppInteractiveButtons(phone: string, bodyText: string, buttons: { id: string, title: string }[]): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

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
                                title: b.title.substring(0, 20) // max 20 chars
                            }
                        }))
                    }
                }
            }),
        });
        return res.ok
    } catch (e) {
        console.error("Failed to send WA message", e)
        return false
    }
}

async function sendWhatsAppInteractiveList(phone: string, bodyText: string, listTitle: string, options: { id: string, title: string, description?: string }[]): Promise<boolean> {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

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
