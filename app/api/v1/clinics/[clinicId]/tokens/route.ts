import { NextResponse } from 'next/server';
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPhone, hashPhone } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";

// Helper to authenticate
async function authenticateAPIRequest(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.split(' ')[1];
    // In a real app, validate this against an API keys table.
    return token === process.env.GLOBAL_API_KEY;
}

export async function POST(
    req: Request,
    { params }: { params: { clinicId: string } }
) {
    if (!await authenticateAPIRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // IP-based Rate Limiting (5 requests per 2 mins per IP)
    const ip = req.headers.get('x-forwarded-for') || 'api-unknown-ip';
    const rateLimit = checkRateLimit(ip, 5, 2 * 60 * 1000);
    if (!rateLimit.success) {
        return NextResponse.json({ error: 'Too many requests. Please slow down.' }, {
            status: 429,
            headers: { 'Retry-After': Math.ceil((rateLimit.reset - Date.now()) / 1000).toString() }
        });
    }

    try {
        const body = await req.json();
        const { phone, name, is_priority } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        const supabase = createAdminClient();

        // Check if there is an active session
        const today = new Date().toISOString().split('T')[0];
        const { data: session } = await supabase
            .from('sessions')
            .select('id, status')
            .eq('business_id', params.clinicId)
            .eq('date', today)
            .single();

        if (!session || session.status !== 'OPEN') {
            return NextResponse.json({ error: 'Queue is currently closed or paused' }, { status: 400 });
        }

        let phoneEncrypted: string | null = null;
        let phoneHash: string | null = null;

        try {
            phoneEncrypted = encryptPhone(phone);
            phoneHash = hashPhone(phone);
        } catch (cryptoErr) {
            console.error('[API createToken] Encryption key not configured, storing plaintext:', cryptoErr);
        }

        const { data, error } = await supabase.rpc('create_token_atomic', {
            p_business_id: params.clinicId,
            p_session_id: session.id,
            p_name: name || "Guest",
            p_phone: phoneEncrypted ? null : phone,
            p_phone_encrypted: phoneEncrypted,
            p_phone_hash: phoneHash,
            p_is_priority: !!is_priority,
            p_staff_id: null // API creation
        });

        if (error) throw error;

        return NextResponse.json({ success: true, token: data }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
