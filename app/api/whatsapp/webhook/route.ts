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
    // CRITICAL: Mandatory in all environments to prevent spoofing.
    if (!APP_SECRET) {
        console.error(`[${requestId}] CRITICAL: WHATSAPP_APP_SECRET is not configured! Webhook aborted.`);
        return errorResponse('Webhook configuration error', 500, requestId);
    }

    if (!signature) {
        console.warn(`[${requestId}] Webhook rejected: Missing x-hub-signature-256 header.`);
        return errorResponse('Missing signature', 401, requestId);
    }

    const expectedSignature = `sha256=${crypto
        .createHmac('sha256', APP_SECRET)
        .update(rawBody)
        .digest('hex')}`

    try {
        const sigBuf = Buffer.from(signature, 'utf8');
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            console.warn(`[${requestId}] Webhook rejected: Invalid signature.`);
            return errorResponse('Invalid signature', 401, requestId)
        }
    } catch (e) {
        console.error(`[${requestId}] Signature validation error:`, e);
        return errorResponse('Invalid signature format', 401, requestId)
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

    // Phase 6: Delivery Status Webhook
    if (value.statuses) {
        const statusObj = value.statuses[0];
        const supabaseStatus = createAdminClient();
        if (statusObj?.id && statusObj?.status) {
            await supabaseStatus.from('whatsapp_logs')
                .update({
                    status: statusObj.status,
                    updated_at: new Date().toISOString()
                })
                .eq('meta_message_id', statusObj.id);
        }
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

    // Phase 4 REMEDIATION: Webhook Idempotency Race Condition
    // REMOVED SELECT-then-INSERT. Using DB-level atomic insert.

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

    // Atomic Insert to prevent double processing of the same webhook id
    // DPDP PROFILING: Mask phone in high-frequency logs (keep only last 4 digits)
    const maskedPhone = phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7);

    const { error: insertDupError } = await supabase.from('whatsapp_messages').insert({
        id: waMessageId,
        phone: maskedPhone,
        direction: 'INBOUND',
        message_type: message.type || 'text',
        status: 'received'
    });

    if (insertDupError) {
        // 23505 is PostgreSQL unique_violation
        if (insertDupError.code === '23505') {
            return successResponse({ message: 'Duplicate webhook ignored' }, requestId)
        }
        console.error("Webhook msg insert error:", insertDupError);
    }

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
                    { id: 'VIEW_STATUS', title: 'Track Live 📲' },
                    { id: 'CANCEL_START', title: 'Cancel' }
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
                    { id: 'JOIN_QUEUE', title: 'Join Queue 🏥' },
                    { id: 'VIEW_STATUS_PUBLIC', title: 'Live Status 📲' }
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

    // 2.5 BILLING METERING
    await supabase.rpc('fn_increment_usage', { p_clinic_id: businessId, p_type: 'WHATSAPP' });

    // State Machine Dispatcher
    if (conv.state === 'AWAITING_JOIN_CONFIRM') {
        if (interactiveResponseId === 'JOIN_QUEUE') {
            // Check if we have a name from WhatsApp profile
            const waName = name || 'WhatsApp Patient';

            // Proceed to Department/Doctor Selection or atomic creation

            // 1. Fetch departments to see if we need selection
            const { data: departments } = await supabase
                .from('departments')
                .select('id, name')
                .eq('clinic_id', businessId)
                .eq('is_active', true);

            if (departments && departments.length > 1) {
                // Multi-department hospital: Ask user to select a department
                await supabase.from('whatsapp_conversations').update({
                    state: 'AWAITING_DEPARTMENT_SELECTION',
                    last_interaction: new Date().toISOString()
                }).eq('id', conv.id);

                await sendWhatsAppInteractiveList(
                    phoneNumber,
                    "Please select the department you wish to visit:",
                    "Select Department",
                    [{
                        title: "Available Departments",
                        rows: departments.map(d => ({
                            id: `DEPT_${d.id}`,
                            title: d.name
                        }))
                    }]
                );
                return successResponse({ message: 'Sent department list' }, requestId);
            }

            // If only 1 department (or none yet), proceed automatically using the first one or generic
            const defaultDeptId = departments?.[0]?.id || null;

            // Bypass straight to queue insertion using new RPC
            await createClinicalVisitFromWhatsApp(phoneNumber, conv, businessId, businessName, waName, defaultDeptId, null, supabase);

        } else if (interactiveResponseId === 'VIEW_STATUS_PUBLIC') {
            await sendWhatsAppReply(phoneNumber, `Currently at ${businessName}, the queue is active. Token creation is available.`);
        }

    } else if (conv.state === 'AWAITING_DEPARTMENT_SELECTION') {
        if (interactiveResponseId.startsWith('DEPT_')) {
            const deptId = interactiveResponseId.replace('DEPT_', '');

            // Check if department has multiple doctors and non-pooled routing
            const { data: dept } = await supabase.from('departments').select('routing_strategy').eq('id', deptId).single();
            const { data: doctors } = await supabase.from('doctors').select('id, name, specialization').eq('department_id', deptId).eq('is_active', true);

            if (dept?.routing_strategy !== 'POOLED' && doctors && doctors.length > 1) {
                // Ask to select a doctor
                await supabase.from('whatsapp_conversations').update({
                    state: 'AWAITING_DOCTOR_SELECTION',
                    context_data: { selected_department_id: deptId }, // Temporarily store in context_data if it exists, otherwise we'll just encode it in the next ID
                    last_interaction: new Date().toISOString()
                }).eq('id', conv.id);

                await sendWhatsAppInteractiveList(
                    phoneNumber,
                    "Please select your preferred specialist:",
                    "Select Doctor",
                    [{
                        title: "Available Specialists",
                        rows: doctors.map(d => ({
                            id: `DOC_${deptId}_${d.id}`,
                            title: d.name.startsWith("Dr.") ? d.name : `Dr. ${d.name}`,
                            description: d.specialization || "OPD Specialist"
                        }))
                    }, {
                        title: "Automated Routing",
                        rows: [{
                            id: `DOC_${deptId}_ANY`,
                            title: "Smart Balance",
                            description: "First available consultant (Fastest)"
                        }]
                    }]
                );
            } else {
                // Direct to queue
                const waName = name || 'WhatsApp Patient';
                await createClinicalVisitFromWhatsApp(phoneNumber, conv, businessId, businessName, waName, deptId, null, supabase);
            }
        } else {
            await sendWhatsAppReply(phoneNumber, "Please select an option from the list to continue.");
        }

    } else if (conv.state === 'AWAITING_DOCTOR_SELECTION') {
        if (interactiveResponseId.startsWith('DOC_')) {
            // DOC_{deptId}_{docId}
            const parts = interactiveResponseId.split('_');
            const deptId = parts[1];
            const docId = parts[2] === 'ANY' ? null : parts[2];

            const waName = name || 'WhatsApp Patient';
            await createClinicalVisitFromWhatsApp(phoneNumber, conv, businessId, businessName, waName, deptId, docId, supabase);
        } else {
            await sendWhatsAppReply(phoneNumber, "Please select a doctor to continue.");
        }

    } else if (conv.state === 'ACTIVE_TOKEN') {
        if (interactiveResponseId === 'CANCEL_START' || interactiveResponseId === 'Cancel' || interactiveResponseId === 'Reschedule') {
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
        } else if ((interactiveResponseId === 'VIEW_STATUS' || interactiveResponseId === 'Track Live' || interactiveResponseId === 'Track Live 📲') && conv.active_visit_id) {
            // Fetch live status via clinical_visits
            const { data: vData } = await supabase.from('clinical_visits').select('token_number, status, session_id').eq('id', conv.active_visit_id).single();
            if (vData) {
                // Get people ahead count for clarity
                const { count: ahead } = await supabase.from('clinical_visits').select('id', { count: 'exact', head: true })
                    .eq('session_id', vData.session_id).eq('status', 'WAITING').lt('token_number', vData.token_number);

                await sendWhatsAppReply(phoneNumber, `Live Status 🏥\n\nYour Token: #${vData.token_number}\nStatus: ${vData.status}\nPeople Ahead: ${ahead || 0}`);
            }
        } else if (interactiveResponseId === 'CONTACT_INFO' || interactiveResponseId === 'Need Help') {
            await sendWhatsAppReply(phoneNumber, `Contact ${businessName} reception at +91XXXXXXXXXX or visit the front desk for immediate assistance.`);
        } else if (interactiveResponseId === 'REJOIN_QUEUE') {
            await supabase.from('whatsapp_conversations').update({ state: 'AWAITING_JOIN_CONFIRM' }).eq('id', conv.id);
            await sendWhatsAppReply(phoneNumber, "Send JOIN to start a new token request.");
        } else if ((interactiveResponseId === 'IM_HERE' || interactiveResponseId === '✅ I’M HERE') && conv.active_visit_id) {
            // Patient Self-Check-in (Professional Hospital Flow)
            const { data: vData } = await supabase.from('clinical_visits')
                .select('clinic_id, session_id, token_number, status')
                .eq('id', conv.active_visit_id)
                .single();

            if (vData) {
                if (vData.status === 'SERVED' || vData.status === 'SKIPPED') {
                    // Offer Lab Return / Report Review
                    await sendWhatsAppInteractiveButtons(
                        phoneNumber,
                        "Your visit was completed or skipped. Are you returning now with a laboratory report for review?",
                        [
                            { id: 'LAB_RETURN_CONFIRM', title: 'Yes, Report Review' },
                            { id: 'REJOIN_QUEUE', title: 'New Visit' }
                        ]
                    );
                } else {
                    // Atomic Arrival via RPC
                    await supabase.rpc('rpc_process_clinical_action', {
                        p_clinic_id: vData.clinic_id,
                        p_session_id: vData.session_id,
                        p_staff_id: null,
                        p_action: 'ARRIVE',
                        p_visit_id: conv.active_visit_id
                    });

                    await sendWhatsAppReply(phoneNumber, `✅ *Check-in Successful!*\n\nToken: *#${vData.token_number}*\nStatus: *Physically Arrived*\n\nWe have notified the reception. Please proceed to the waiting area. A staff member will call you shortly.`);
                }
            }
        } else if (interactiveResponseId === 'LAB_RETURN_CONFIRM' && conv.active_visit_id) {
            // Trigger Priority Upgrade for Report Review
            const { data: vData } = await supabase.from('clinical_visits').select('session_id').eq('id', conv.active_visit_id).single();
            if (vData) {
                const { data: res } = await supabase.rpc('rpc_lab_return_requeue', {
                    p_visit_id: conv.active_visit_id,
                    p_session_id: vData.session_id,
                    p_actor_id: null
                });

                if (res?.success) {
                    await sendWhatsAppReply(phoneNumber, "✅ *Priority Upgraded: Report Review*\n\nWe have placed you back in the queue with high priority. Please stay nearby; the doctor will recall you shortly.");
                } else {
                    await sendWhatsAppReply(phoneNumber, "Unable to upgrade priority at this time. Please speak to the receptionist.");
                }
            }
        } else if (interactiveResponseId === 'IM_ON_THE_WAY' || interactiveResponseId === 'ON MY WAY 🚶') {
            await sendWhatsAppReply(phoneNumber, "Safe travels! 🚗\n\nPlease tap *'I'm Here'* once you reach the clinic premises to confirm your physical presence.");
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

async function sendWhatsAppInteractiveList(phone: string, bodyText: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]) {
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
                    type: "list",
                    header: {
                        type: "text",
                        text: "Options"
                    },
                    body: { text: bodyText },
                    action: {
                        button: buttonText.substring(0, 20),
                        sections: sections.map(s => ({
                            title: s.title.substring(0, 24),
                            rows: s.rows.map(r => ({
                                id: r.id,
                                title: r.title.substring(0, 24),
                                description: r.description ? r.description.substring(0, 72) : undefined
                            }))
                        }))
                    }
                }
            }),
        });
    } catch (e) {
        console.error("Failed to send WA list message", e)
    }
}

async function createClinicalVisitFromWhatsApp(phoneNumber: string, conv: { id: string }, businessId: string, businessName: string, waName: string, deptId: string | null, docId: string | null, supabase: ReturnType<typeof createAdminClient>) {
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
        await supabase.from('whatsapp_conversations').update({ state: 'IDLE' }).eq('id', conv.id);
        return;
    }

    const { encryptPhone, hashPhone } = await import('@/lib/crypto');
    const phoneEncrypted = encryptPhone(phoneNumber);
    const phoneHash = hashPhone(phoneNumber);

    const { data: result, error: rpcError } = await supabase.rpc('rpc_create_clinical_visit', {
        p_clinic_id: businessId,
        p_session_id: session.id,
        p_patient_name: waName,
        p_patient_phone: phoneNumber,
        p_phone_encrypted: phoneEncrypted,
        p_phone_hash: phoneHash,
        p_department_id: deptId,
        p_requested_doctor_id: docId,
        p_visit_type: 'OPD',
        p_is_priority: false,
        p_source: 'WHATSAPP'
    });

    if (rpcError || !result || !result.success) {
        await supabase.from('whatsapp_conversations').update({ state: 'IDLE' }).eq('id', conv.id);
        return;
    }

    const { count: aheadCount } = await supabase
        .from('clinical_visits')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id)
        .eq('status', 'WAITING')
        .eq('department_id', deptId)
        .lt('token_number', result.token_number);

    const { data: bizData } = await supabase.from('businesses').select('settings').eq('id', businessId).single();
    const settings = bizData?.settings as { avg_wait_time?: number } | null;
    const avg = settings?.avg_wait_time || 12;

    await supabase.from('whatsapp_conversations').update({
        state: 'ACTIVE_TOKEN',
        active_visit_id: result.visit_id,
        last_interaction: new Date().toISOString()
    }).eq('id', conv.id);

    // Resolve Doctor and Department names for confirmation
    let doctorName = "Duty Consultant";
    let departmentName = "General OPD";

    if (docId) {
        const { data: docData } = await supabase.from('doctors').select('name').eq('id', docId).single();
        if (docData?.name) doctorName = docData.name.startsWith("Dr.") ? docData.name : `Dr. ${docData.name}`;
    }
    if (deptId) {
        const { data: deptData } = await supabase.from('departments').select('name').eq('id', deptId).single();
        if (deptData?.name) departmentName = deptData.name;
    }

    // Dispatch the NEW High-Fidelity Utility Template (7 Variables)
    const { sendTokenConfirmation } = await import('@/lib/whatsapp-dispatch');
    await sendTokenConfirmation({
        patientName: waName,
        tokenNumber: `#${result.token_number}`,
        doctorName: doctorName,
        departmentName: departmentName,
        clinicName: businessName,
        clinicId: businessId,
        visitId: result.visit_id,
        phone: phoneNumber,
        patientsAhead: aheadCount || 0,
        avgConsultationSeconds: avg * 60,
        mapsQuery: businessName
    });
}
// Debug log
