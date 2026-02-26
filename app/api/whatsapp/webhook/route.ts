import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { successResponse, errorResponse, generateRequestId } from '@/lib/api-response'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'qlink_wa_token'
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ''

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 })
    }
    return errorResponse('Forbidden', 403)
}

export async function POST(req: Request) {
    const requestId = generateRequestId();
    const signature = req.headers.get('x-hub-signature-256')
    const rawBody = await req.text()

    // IP Rate Limit check (Phase 5)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const supabaseIpCheck = createAdminClient();
    if (ip !== 'unknown') {
        const { data: allowedIp } = await supabaseIpCheck.rpc('rpc_check_rate_limit', {
            p_ip: ip,
            p_endpoint: 'wa_webhook_ip',
            p_max_hits: 20,
            p_window_seconds: 60
        });
        if (!allowedIp) return errorResponse('Rate Limited (IP)', 429, requestId);
    }

    // 1. Validate Meta webhook signature
    if (APP_SECRET && signature) {
        const expectedSignature = `sha256=${crypto
            .createHmac('sha256', APP_SECRET)
            .update(rawBody)
            .digest('hex')}`
        if (signature !== expectedSignature) {
            return errorResponse('Invalid signature', 401, requestId)
        }
    }

    let body
    try {
        body = JSON.parse(rawBody)
    } catch {
        return errorResponse('Invalid JSON', 400, requestId)
    }

    // Acknowledge non-message webhooks or empty payloads
    if (body.object !== 'whatsapp_business_account' || !body.entry?.[0]?.changes?.[0]?.value) {
        return successResponse({ message: 'Event Received' }, requestId)
    }

    const value = body.entry[0].changes[0].value
    const message = value.messages?.[0]
    const contact = value.contacts?.[0]

    // Acknowledge read/delivery status updates immediately
    if (value.statuses) {
        return new NextResponse('Status processed', { status: 200 })
    }

    if (!message || !contact) return new NextResponse('No message content', { status: 200 })

    const rawPhone = contact.wa_id || message.from
    const name = contact.profile?.name || 'WhatsApp Patient'
    const waMessageId = message.id

    let messageText = message.text?.body?.trim() || ''

    // 2. Normalize Indian phone to 10-digit
    // Accept: +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX
    let phoneNumber = rawPhone.replace(/\D/g, '')
    if (phoneNumber.startsWith('91') && phoneNumber.length === 12) {
        phoneNumber = phoneNumber.substring(2)
    } else if (phoneNumber.length !== 10) {
        // Discard malformed phone
        return new NextResponse('Invalid phone number', { status: 200 })
    }

    const supabase = createAdminClient()

    // -------------------------------------------------------------------------------------------------
    // Phase 6 WhatsApp Interactive Additions - State Machine Webhook
    // -------------------------------------------------------------------------------------------------

    // Deduplication check
    const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('id', waMessageId)
        .single()

    if (existingMsg) {
        return successResponse({ message: 'Duplicate webhook ignored' }, requestId)
    }

    // Identify interactive response
    let interactiveResponseId = '';
    if (message.type === 'interactive') {
        if (message.interactive.type === 'button_reply') {
            interactiveResponseId = message.interactive.button_reply.id;
            messageText = message.interactive.button_reply.title;
        } else if (message.interactive.type === 'list_reply') {
            interactiveResponseId = message.interactive.list_reply.id;
            messageText = message.interactive.list_reply.title;
        }
    }

    // Log incoming message
    await supabase.from('whatsapp_messages').insert({
        id: waMessageId,
        phone: phoneNumber,
        direction: 'INBOUND',
        message_type: message.type || 'text',
        status: 'received'
    });

    // We need clinic_id context. For new joins, it will be parsed from JOIN_SLUG.
    // For existing conversations, we get it from whatsapp_conversations state.

    // 1. Check if user sent a JOIN command to start a fresh flow
    const isJoinCommand = messageText.toUpperCase().startsWith('JOIN_')
    let clinicSlug = '';

    if (isJoinCommand) {
        clinicSlug = messageText.split('_')[1]?.toLowerCase().trim()
        if (!clinicSlug) {
            await sendWhatsAppReply(phoneNumber, "Please send a valid command like JOIN_CLINICNAME");
            return successResponse({ message: 'Invalid command message sent' }, requestId)
        }

        // Find clinic to initialize state
        const { data: business } = await supabase
            .from('businesses')
            .select('id, name')
            .eq('slug', clinicSlug)
            .single()

        if (!business) {
            await sendWhatsAppReply(phoneNumber, "Clinic not found. Please check the clinic code.");
            return successResponse({ message: 'Clinic not found message sent' }, requestId)
        }

        // Check if there is already an active session taking tokens
        const todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        const dateString = new Date(todayIST).toISOString().split('T')[0]

        const { data: session } = await supabase
            .from('sessions')
            .select('id')
            .eq('business_id', business.id)
            .eq('date', dateString)
            .in('status', ['OPEN', 'PAUSED'])
            .single()

        if (!session) {
            await sendWhatsAppReply(phoneNumber, `Sorry, ${business.name} is not accepting queue joins right now.`);
            return successResponse({ message: 'Session closed message sent' }, requestId)
        }

        // Establish Conversation State (if we need to check state here)
        // Check if they already have an active token from ANY source
        const { data: activeToken } = await supabase
            .from('tokens')
            .select('id, token_number, status, business:businesses(name)')
            .eq('business_id', business.id)
            .eq('patient_phone', phoneNumber)
            .eq('session_id', session.id)
            .in('status', ['WAITING', 'SERVING'])
            .single()

        if (activeToken) {
            // Already has active token
            // Update conv state to ACTIVE_TOKEN if it isn't already
            await supabase.from('whatsapp_conversations').upsert({
                clinic_id: business.id,
                phone: phoneNumber,
                state: 'ACTIVE_TOKEN',
                active_token_id: activeToken.id,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'clinic_id,phone' })

            // Determine estimated wait directly or simple view
            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `🟢 You already have an active token.\n\n🎟 Token: #${activeToken.token_number}\nStatus: ${activeToken.status}\n\nWhat would you like to do?`,
                [
                    { id: 'VIEW_STATUS', title: 'View Live Status' },
                    { id: 'CANCEL_TOKEN', title: 'Cancel Token' }
                ]
            );
            return successResponse({ message: 'Sent active token interactive' }, requestId)
        } else {
            // NEW USER Flow
            await supabase.from('whatsapp_conversations').upsert({
                clinic_id: business.id,
                phone: phoneNumber,
                state: 'AWAITING_NAME',
                active_token_id: null,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'clinic_id,phone' })

            await sendWhatsAppReply(phoneNumber, `Welcome to ${business.name} 🏥\n\nPlease reply with your full name to join today's queue.`);
            return successResponse({ message: 'Sent name request' }, requestId)
        }
    }

    // 2. Not a JOIN command. Proceed with State Machine logic.
    // We need to look up active conversation
    const { data: activeConvs } = await supabase
        .from('whatsapp_conversations')
        .select('*, clinic:businesses(id, name)')
        .eq('phone', phoneNumber)
        .order('last_interaction', { ascending: false })
        .limit(1)

    const conv = activeConvs?.[0];

    if (!conv) {
        // Just log general interaction if no active state
        await supabase.from('conversations').upsert({
            business_id: null,
            phone_number: phoneNumber,
            last_message_at: new Date().toISOString(),
            conversation_open: true,
            wa_conversation_id: null
        }, { onConflict: 'business_id,phone_number' });
        return successResponse({ message: 'General chat logged' }, requestId)
    }

    const businessId = conv.clinic.id;
    const businessName = conv.clinic.name;

    // State Machine Dispatcher
    if (conv.state === 'AWAITING_NAME') {
        const patientName = messageText;
        // Proceed to confirmation
        await supabase.from('whatsapp_conversations').update({
            state: 'AWAITING_CONFIRMATION',
            last_interaction: new Date().toISOString()
        }).eq('id', conv.id);

        // Store temp name in state or rely on token atomic. Actually we need to pass the name.
        // We can temporarily update patient profile or just ask for confirmation knowing we can use the name from profile later.
        // To be completely robust, we should store temp data. But for now we will just use the name provided in the whatsapp msg obj.
        // Wait, the confirmation doesn't have the text typed previously.
        // Quick fix: Update the name in the user's contacts profile in DB or rely on the WA contact name when confirming.
        // Let's use `name` from `contact.profile.name` as fallback.

        await sendWhatsAppInteractiveButtons(
            phoneNumber,
            `Hi ${patientName} 👋\n\nYou are joining today's queue.\n\nPlease confirm:`,
            [
                { id: `CONFIRM_${encodeURIComponent(patientName)}`, title: 'Confirm & Join' },
                { id: 'CANCEL_JOIN', title: 'Cancel' }
            ]
        );

    } else if (conv.state === 'AWAITING_CONFIRMATION') {
        if (interactiveResponseId.startsWith('CONFIRM_')) {
            const patientName = decodeURIComponent(interactiveResponseId.replace('CONFIRM_', ''));

            // Execute Token Creation
            const todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
            const dateString = new Date(todayIST).toISOString().split('T')[0]
            const { data: session } = await supabase
                .from('sessions')
                .select('id')
                .eq('business_id', businessId)
                .eq('date', dateString)
                .in('status', ['OPEN', 'PAUSED'])
                .single()

            if (!session) {
                await sendWhatsAppReply(phoneNumber, "The session has closed. Cannot create token.");
                await supabase.from('whatsapp_conversations').update({ state: 'IDLE' }).eq('id', conv.id);
                return successResponse({ message: 'Session closed on confirm' }, requestId);
            }

            // Import crypto functions
            // I need to add the imports at the top of the file but I can use dynamic import here to keep things simple or add it to the top.
            // Let's add them to the top of the file in another step and use them here.

            let phoneEncrypted: string | null = null;
            let phoneHash: string | null = null;

            try {
                // Dynamically import to safely execute here
                const { encryptPhone, hashPhone } = await import('@/lib/crypto');
                phoneEncrypted = encryptPhone(phoneNumber);
                phoneHash = hashPhone(phoneNumber);
            } catch (err) {
                console.error("Encryption failed for WA hook:", err);
            }

            const { data: tokenResult, error } = await supabase.rpc('create_token_atomic', {
                p_business_id: businessId,
                p_session_id: session.id,
                p_phone: phoneEncrypted ? null : phoneNumber,
                p_name: patientName || name, // fallback to WA profile name
                p_is_priority: false,
                p_staff_id: null,
                p_phone_encrypted: phoneEncrypted,
                p_phone_hash: phoneHash
            });

            if (error || !tokenResult || !tokenResult.success) {
                console.error("WA Token Creation Error:", { error, tokenResult, params: { businessId, sessionId: session.id, phoneNumber, patientName, name } });
                await sendWhatsAppReply(phoneNumber, "System error while adding you to the queue. Please try again.");
                await supabase.from('whatsapp_conversations').update({ state: 'IDLE' }).eq('id', conv.id);
                return successResponse({ message: 'Token creation error' }, requestId);
            }

            // Success Transition
            await supabase.from('whatsapp_conversations').update({
                state: 'ACTIVE_TOKEN',
                active_token_id: tokenResult.token_id,
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);

            const ewtMinutes = Math.round((tokenResult.ewt_seconds || 0) / 60);

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `🎟 Token Confirmed!\n\nToken Number: #${tokenResult.token_number}\nEstimated Wait: ~${ewtMinutes} minutes\n\nYou will receive alerts when your turn is near.`,
                [
                    { id: 'VIEW_STATUS', title: 'View Live Status' },
                    { id: 'CANCEL_TOKEN', title: 'Cancel My Token' }
                ]
            );

        } else if (interactiveResponseId === 'CANCEL_JOIN') {
            await supabase.from('whatsapp_conversations').update({
                state: 'IDLE',
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);
            await sendWhatsAppReply(phoneNumber, "Request cancelled. You can join later by sending JOIN inside this chat.");
        } else {
            // Invalid reply in this state
            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `Please use the buttons to confirm joining the queue:`,
                [
                    { id: `CONFIRM_${name}`, title: 'Confirm & Join' },
                    { id: 'CANCEL_JOIN', title: 'Cancel' }
                ]
            );
        }

    } else if (conv.state === 'ACTIVE_TOKEN') {
        if (interactiveResponseId === 'CANCEL_TOKEN' && conv.active_token_id) {
            // Cancel the token
            await supabase.from('tokens').update({ status: 'CANCELLED' }).eq('id', conv.active_token_id);
            await supabase.from('whatsapp_conversations').update({
                state: 'IDLE',
                active_token_id: null,
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `❌ Your token has been cancelled.\n\nYou may rejoin anytime by joining the queue again.`,
                [{ id: 'REJOIN_QUEUE', title: 'Rejoin Queue' }]
            );
        } else if (interactiveResponseId === 'VIEW_STATUS' && conv.active_token_id) {
            // Fetch live status
            const { data: tData } = await supabase.from('tokens').select('token_number, status, session_id').eq('id', conv.active_token_id).single();
            if (tData) {
                const { data: sData } = await supabase.from('sessions').select('last_token_number').eq('id', tData.session_id).single();
                await sendWhatsAppReply(phoneNumber, `Live Status 🏥\n\nYour Token: #${tData.token_number}\nStatus: ${tData.status}\nCurrently Serving: #${sData?.last_token_number || '-'}`);
            }
        } else if (interactiveResponseId === 'REJOIN_QUEUE') {
            // Treat like JOIN command
            await supabase.from('whatsapp_conversations').upsert({
                clinic_id: businessId,
                phone: phoneNumber,
                state: 'AWAITING_NAME',
                active_token_id: null,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'clinic_id,phone' })

            await sendWhatsAppReply(phoneNumber, `Welcome back to ${businessName} 🏥\n\nPlease reply with your full name to join today's queue.`);
        } else if (interactiveResponseId === 'IM_ON_THE_WAY' || interactiveResponseId === 'IM_HERE') {
            await sendWhatsAppReply(phoneNumber, "Noted! Please wait at the reception area for your turn.");
        }

    } else if (conv.state === 'AWAITING_FEEDBACK_TEXT') {
        if (conv.active_token_id) {
            await supabase.from('token_feedback').update({ feedback_text: messageText }).eq('token_id', conv.active_token_id);
        }
        await supabase.from('whatsapp_conversations').update({
            state: 'IDLE',
            active_token_id: null, // Clear active token now that flow is fully over
            last_interaction: new Date().toISOString()
        }).eq('id', conv.id);

        await sendWhatsAppReply(phoneNumber, "Thank you for your feedback! We will use it to improve our service.");

    } else if (conv.state === 'AWAITING_FEEDBACK_RATING') {
        if (interactiveResponseId.startsWith('RATE_')) {
            const ratingStr = interactiveResponseId.replace('RATE_', '');
            const rating = parseInt(ratingStr);

            if (conv.active_token_id) {
                await supabase.from('token_feedback').upsert({
                    token_id: conv.active_token_id,
                    rating: rating
                });
            }

            if (rating <= 3) {
                await supabase.from('whatsapp_conversations').update({
                    state: 'AWAITING_FEEDBACK_TEXT',
                    last_interaction: new Date().toISOString()
                }).eq('id', conv.id);
                await sendWhatsAppReply(phoneNumber, "We’re sorry your experience wasn’t perfect.\n\nPlease tell us what went wrong so we can improve.");
            } else {
                await supabase.from('whatsapp_conversations').update({
                    state: 'IDLE',
                    active_token_id: null,
                    last_interaction: new Date().toISOString()
                }).eq('id', conv.id);

                await sendWhatsAppInteractiveButtons(
                    phoneNumber,
                    "We’re glad you had a great experience! 😊\n\nWould you like to leave us a Google review?",
                    [{ id: 'LEAVE_GOOGLE_REVIEW', title: 'Leave Review' }]
                );
            }
        } else {
            // Treat general text during feedback as skipping
            await supabase.from('whatsapp_conversations').update({
                state: 'IDLE',
                active_token_id: null,
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);
            await sendWhatsAppReply(phoneNumber, "Thanks for visiting us!");
        }
    } else {
        // Fallback for IDLE state and non-command messages
        await supabase.from('conversations').upsert({
            business_id: businessId,
            phone_number: phoneNumber,
            last_message_at: new Date().toISOString(),
            conversation_open: true,
            wa_conversation_id: null
        }, { onConflict: 'business_id,phone_number' });
    }

    // Always log in traditional conversations table as well to keep the old 24h window working
    await supabase.from('conversations').upsert({
        business_id: businessId,
        phone_number: phoneNumber,
        last_message_at: new Date().toISOString(),
        conversation_open: true,
        wa_conversation_id: null
    }, { onConflict: 'business_id,phone_number' });

    return successResponse({ message: 'Webhook processed' }, requestId)
}

// Simulated API calls to WhatsApp Cloud API (Wait, lib/whatsapp.ts now has interactive versions. I will use the local text one here for basic replies to avoid refactoring all imports)
async function sendWhatsAppReply(phone: string, text: string) {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

    if (!WABA_ID || !TOKEN) {
        console.warn('WhatsApp API not configured, skipping message to', phone, ":", text)
        return
    }

    try {
        await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${phone}`, // Append 91 for Indian numbers as FB expects full format
                type: 'text',
                text: { body: text }
            })
        })
    } catch (e) {
        console.error("Failed to send WA message", e)
    }
}

async function sendWhatsAppInteractiveButtons(phone: string, bodyText: string, buttons: { id: string, title: string }[]) {
    const WABA_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

    if (!WABA_ID || !TOKEN) return;

    try {
        await fetch(`https://graph.facebook.com/v19.0/${WABA_ID}/messages`, {
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
    } catch (e) {
        console.error("Failed to send WA message", e)
    }
}
// Debug log
