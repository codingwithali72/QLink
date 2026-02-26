import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

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
    return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: Request) {
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
        if (!allowedIp) return new NextResponse('Rate Limited (IP)', { status: 429 });
    }

    // 1. Validate Meta webhook signature
    if (APP_SECRET && signature) {
        const expectedSignature = `sha256=${crypto
            .createHmac('sha256', APP_SECRET)
            .update(rawBody)
            .digest('hex')}`
        if (signature !== expectedSignature) {
            return new NextResponse('Invalid signature', { status: 401 })
        }
    }

    let body
    try {
        body = JSON.parse(rawBody)
    } catch (e) {
        return new NextResponse('Invalid JSON', { status: 400 })
    }

    // Acknowledge non-message webhooks or empty payloads
    if (body.object !== 'whatsapp_business_account' || !body.entry?.[0]?.changes?.[0]?.value) {
        return new NextResponse('Event Received', { status: 200 })
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

    const messageText = message.text?.body?.trim() || ''

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

    // Process specific commands
    const isJoinCommand = messageText.toUpperCase().startsWith('JOIN_')

    if (isJoinCommand) {
        // Phone Rate Limit check (Phase 5)
        const { data: allowedPhone } = await supabase.rpc('rpc_check_rate_limit', {
            p_ip: phoneNumber,
            p_endpoint: 'wa_webhook_phone',
            p_max_hits: 3,
            p_window_seconds: 60
        });

        if (!allowedPhone) {
            await sendWhatsAppReply(phoneNumber, "Too many requests. Please wait a minute and try again.");
            return new NextResponse('OK', { status: 200 })
        }

        const slug = messageText.split('_')[1]?.toLowerCase().trim()
        if (!slug) {
            await sendWhatsAppReply(phoneNumber, "Please send a valid command like JOIN_CLINICNAME");
            return new NextResponse('OK', { status: 200 })
        }

        // Identify clinic
        const { data: business } = await supabase
            .from('businesses')
            .select('id, name')
            .eq('slug', slug)
            .single()

        if (!business) {
            await sendWhatsAppReply(phoneNumber, "Clinic not found. Please check the clinic code.");
            return new NextResponse('OK', { status: 200 })
        }

        // Find open session
        const todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        const dateString = new Date(todayIST).toISOString().split('T')[0]

        const { data: session } = await supabase
            .from('sessions')
            .select('id, last_token_number')
            .eq('business_id', business.id)
            .eq('date', dateString)
            .in('status', ['OPEN', 'PAUSED'])
            .single()

        if (!session) {
            await sendWhatsAppReply(phoneNumber, `Sorry, ${business.name} is not accepting queue joins right now.`);
            return new NextResponse('OK', { status: 200 })
        }

        // DB Transactional Token Creation + Dup Check via existing RPC
        const { data: tokenResult, error } = await supabase.rpc('create_token_atomic', {
            p_business_id: business.id,
            p_session_id: session.id,
            p_phone: phoneNumber,
            p_name: name,
            p_is_priority: false,
            p_source: 'DIRECT_WA'
        })

        if (error || !tokenResult) {
            await sendWhatsAppReply(phoneNumber, "System error while adding you to the queue. Please try again or walk-in.");
            return new NextResponse('OK', { status: 200 })
        }

        if (tokenResult.success) {
            // New Token
            const ewtMinutes = Math.round((tokenResult.ewt_seconds || 0) / 60);
            const ewtMessage = ewtMinutes > 0 ? ` (Estimated wait: ~${ewtMinutes} mins).` : '.';

            await sendWhatsAppReply(phoneNumber, `Success! You are added to the queue at ${business.name}. Your token number is *${tokenResult.token_number}*${ewtMessage} Please make sure you are physically present when your turn approaches.`);

            // Log message for cost tracking
            await supabase.from('message_logs').insert({
                business_id: business.id,
                phone_number: phoneNumber,
                token_id: tokenResult.token_id,
                message_type: 'CREATED',
                wa_message_id: waMessageId,
                delivery_status: 'sent'
            })
        } else if (tokenResult.is_duplicate) {
            // Duplicate Active Token Handling
            await sendWhatsAppReply(phoneNumber, `You already have an active token (*${tokenResult.existing_token_number}*) at ${business.name}. Please wait for your turn.`);
        } else {
            // Other failures (like daily limit reached)
            await sendWhatsAppReply(phoneNumber, tokenResult.error || "Unable to add you to the queue right now.");
        }
    } else {
        // Log conversations if it's general chat
        // Check 24hr window
        await supabase.from('conversations').upsert({
            business_id: null, // Depending on if we know context
            phone_number: phoneNumber,
            last_message_at: new Date().toISOString(),
            conversation_open: true,
            wa_conversation_id: null
        }, { onConflict: 'business_id,phone_number' }).select()
    }

    return new NextResponse('OK', { status: 200 })
}

// Helper (Would ideally be in lib/whatsapp.ts, placed here for immediate usage)
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
