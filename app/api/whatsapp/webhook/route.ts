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

        // Check if there is already an active visit from ANY source
        await supabase
            .from('clinical_visits')
            .select('id, token_number, status, clinic_id')
            .eq('clinic_id', business.id)
            .eq('session_id', session.id)
            .in('status', ['WAITING', 'SERVING'])
            .filter('patient_id', 'in',
                supabase.from('patients').select('id').eq('clinic_id', business.id).eq('phone', phoneNumber)
            )
            .maybeSingle();

        // Optimized phone lookup via patients
        const { data: patient } = await supabase
            .from('patients')
            .select('id')
            .eq('clinic_id', business.id)
            .eq('phone', phoneNumber)
            .maybeSingle();

        let visitRecord = null;
        if (patient) {
            const { data: v } = await supabase
                .from('clinical_visits')
                .select('id, token_number, status')
                .eq('session_id', session.id)
                .eq('patient_id', patient.id)
                .in('status', ['WAITING', 'SERVING'])
                .maybeSingle();
            visitRecord = v;
        }

        // Check if repeat visit (Step 13)
        const { data: existingPatient } = await supabase.from('patients').select('id, name').eq('clinic_id', business.id).eq('phone', phoneNumber).maybeSingle();

        if (visitRecord) {
            // Already has active visit (Step 13 / Case: Duplicate JOIN)
            await supabase.from('whatsapp_conversations').upsert({
                clinic_id: business.id,
                phone: phoneNumber,
                state: 'ACTIVE_TOKEN',
                active_visit_id: visitRecord.id,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'clinic_id,phone' })

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `Welcome back, ${existingPatient?.name || 'there'}! 👋\n\n🟢 You already have an active token.\n\n🎟 Token: #${visitRecord.token_number}\nStatus: ${visitRecord.status}`,
                [
                    { id: 'VIEW_STATUS', title: 'View Live Status' },
                    { id: 'CANCEL_START', title: 'Cancel My Token' }
                ]
            );
            return successResponse({ message: 'Sent active visit interactive' }, requestId)
        } else {
            // NEW or REPEAT USER Flow (Step 1 & 2)
            await supabase.from('whatsapp_conversations').upsert({
                clinic_id: business.id,
                phone: phoneNumber,
                state: 'AWAITING_JOIN_CONFIRM',
                active_visit_id: null,
                last_interaction: new Date().toISOString()
            }, { onConflict: 'clinic_id,phone' })

            const welcomeMsg = existingPatient
                ? `Welcome back to ${business.name}, ${existingPatient.name}! 🏥\nSecure digital queue system.\n\nWould you like to join today’s queue?`
                : `Welcome to ${business.name} 🏥\nSecure digital queue system.\n\nPlease confirm to join today’s queue.`;

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                welcomeMsg,
                [
                    { id: 'JOIN_QUEUE', title: '1️⃣ Join Queue' },
                    { id: 'VIEW_STATUS_PUBLIC', title: '2️⃣ View Live Status' }
                ]
            );
            return successResponse({ message: 'Sent initial welcome buttons' }, requestId)
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
    if (conv.state === 'AWAITING_JOIN_CONFIRM') {
        if (interactiveResponseId === 'JOIN_QUEUE') {
            // Check if we have a name from WhatsApp profile
            const waName = name || 'WhatsApp Patient';

            // Proceed to atomic creation (Step 3)
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
                return successResponse({ message: 'Session closed on join' }, requestId);
            }

            // Execute Clinical Visit Creation (Phase 12 RPC)
            const { encryptPhone, hashPhone } = await import('@/lib/crypto');
            const phoneEncrypted = encryptPhone(phoneNumber);
            const phoneHash = hashPhone(phoneNumber);

            const { data: result, error: rpcError } = await supabase.rpc('rpc_create_clinical_visit', {
                p_clinic_id: businessId,
                p_session_id: session.id,
                p_patient_name: waName,
                p_phone_encrypted: phoneEncrypted,
                p_phone_hash: phoneHash,
                p_visit_type: 'OPD',
                p_is_priority: false,
                p_consent_purpose: 'QUEUE_MANAGEMENT',
                p_source: 'WHATSAPP'
            });

            if (rpcError || !result || !result.success) {
                await sendWhatsAppReply(phoneNumber, "System error while adding you to the queue.");
                await supabase.from('whatsapp_conversations').update({ state: 'IDLE' }).eq('id', conv.id);
                return successResponse({ message: 'Visit creation error' }, requestId);
            }

            // Calculate people ahead
            const { count: aheadCount } = await supabase
                .from('clinical_visits')
                .select('id', { count: 'exact', head: true })
                .eq('session_id', session.id)
                .eq('status', 'WAITING')
                .lt('token_number', result.token_number);

            // Get current serving
            const { data: servingVisit } = await supabase
                .from('clinical_visits')
                .select('token_number')
                .eq('session_id', session.id)
                .eq('status', 'SERVING')
                .maybeSingle();

            // Get avg time
            const { data: bizData } = await supabase.from('businesses').select('settings').eq('id', businessId).single();
            const settings = bizData?.settings as { avg_wait_time?: number } | null;
            const avg = settings?.avg_wait_time || 12;
            const ewt = (aheadCount || 0) * avg;

            // Step 3: Confirmation Response
            await supabase.from('whatsapp_conversations').update({
                state: 'ACTIVE_TOKEN',
                active_visit_id: result.visit_id,
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `✅ Queue Confirmed\n\nYour token: #${result.token_number}\nNow serving: #${servingVisit?.token_number || '--'}\nPeople ahead: ${aheadCount || 0}\nEst. wait: ${ewt} minutes\n\nYou will receive alerts as your turn approaches.`,
                [
                    { id: 'VIEW_STATUS', title: 'View Live Status' },
                    { id: 'CANCEL_START', title: 'Cancel My Token' },
                    { id: 'CONTACT_INFO', title: 'Contact Reception' }
                ]
            );

        } else if (interactiveResponseId === 'VIEW_STATUS_PUBLIC') {
            await sendWhatsAppReply(phoneNumber, `Currently at ${businessName}, the queue is active. Token creation is available.`);
        }

    } else if (conv.state === 'ACTIVE_TOKEN') {
        if (interactiveResponseId === 'CANCEL_START' && conv.active_visit_id) {
            // Step 9: Confirm Cancellation
            await supabase.from('whatsapp_conversations').update({
                state: 'AWAITING_CANCEL_CONFIRM',
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);

            await sendWhatsAppInteractiveButtons(
                phoneNumber,
                `Are you sure you want to cancel your visit at ${businessName}?`,
                [
                    { id: 'CONFIRM_CANCEL', title: 'Yes, Cancel' },
                    { id: 'KEEP_TOKEN', title: 'No, Keep It' }
                ]
            );
        } else if (interactiveResponseId === 'VIEW_STATUS' && conv.active_visit_id) {
            // Fetch live status via clinical_visits
            const { data: vData } = await supabase.from('clinical_visits').select('token_number, status, session_id').eq('id', conv.active_visit_id).single();
            if (vData) {
                // Get people ahead count for clarity
                const { count: ahead } = await supabase.from('clinical_visits').select('id', { count: 'exact', head: true })
                    .eq('session_id', vData.session_id).eq('status', 'WAITING').lt('token_number', vData.token_number);

                await sendWhatsAppReply(phoneNumber, `Live Status 🏥\n\nYour Token: #${vData.token_number}\nStatus: ${vData.status}\nPeople Ahead: ${ahead || 0}`);
            }
        } else if (interactiveResponseId === 'CONTACT_INFO') {
            await sendWhatsAppReply(phoneNumber, `Contact ${businessName} reception at +91XXXXXXXXXX or visit the front desk.`);
        } else if (interactiveResponseId === 'REJOIN_QUEUE') {
            await supabase.from('whatsapp_conversations').update({ state: 'AWAITING_JOIN_CONFIRM' }).eq('id', conv.id);
            await sendWhatsAppReply(phoneNumber, "Send JOIN to start a new token request.");
        } else if (interactiveResponseId === 'IM_ON_THE_WAY' || interactiveResponseId === 'IM_HERE') {
            await sendWhatsAppReply(phoneNumber, "Noted! Please wait at the reception area for your turn.");
        }

    } else if (conv.state === 'AWAITING_CANCEL_CONFIRM') {
        if (interactiveResponseId === 'CONFIRM_CANCEL' && conv.active_visit_id) {
            // Atomic Action Update (Step 9 confirmed)
            await supabase.rpc('rpc_process_clinical_action', {
                p_visit_id: conv.active_visit_id,
                p_action: 'CANCEL',
                p_staff_id: null
            });

            await supabase.from('whatsapp_conversations').update({
                state: 'IDLE',
                active_visit_id: null,
                last_interaction: new Date().toISOString()
            }).eq('id', conv.id);

            await sendWhatsAppReply(phoneNumber, "Your token has been cancelled. Thank you.");
        } else {
            await supabase.from('whatsapp_conversations').update({ state: 'ACTIVE_TOKEN' }).eq('id', conv.id);
            await sendWhatsAppReply(phoneNumber, "Great! Your token is still active.");
        }

    } else if (conv.state === 'AWAITING_FEEDBACK_TEXT') {
        if (conv.active_visit_id) {
            await supabase.from('token_feedback').update({ feedback_text: messageText }).eq('visit_id', conv.active_visit_id);
        }
        await supabase.from('whatsapp_conversations').update({
            state: 'IDLE',
            active_visit_id: null,
            last_interaction: new Date().toISOString()
        }).eq('id', conv.id);

        await sendWhatsAppReply(phoneNumber, "Thank you for your feedback! We will use it to improve our service.");

    } else if (conv.state === 'AWAITING_FEEDBACK_RATING') {
        if (interactiveResponseId.startsWith('RATE_')) {
            const ratingStr = interactiveResponseId.replace('RATE_', '');
            const rating = parseInt(ratingStr);

            if (conv.active_visit_id) {
                await supabase.from('token_feedback').upsert({
                    visit_id: conv.active_visit_id,
                    rating: rating
                }, { onConflict: 'visit_id' });
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
                    active_visit_id: null,
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
                active_visit_id: null,
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
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;

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
    const WABA_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;

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
