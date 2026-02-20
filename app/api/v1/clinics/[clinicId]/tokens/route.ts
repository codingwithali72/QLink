import { NextResponse } from 'next/server';
import { createAdminClient } from "@/lib/supabase/admin";
// Note: action imports in route handlers are tricky if they use cookies(), so we will implement basic REST natively.

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

        const { data, error } = await supabase.rpc('create_token_atomic', {
            p_business_id: params.clinicId,
            p_session_id: session.id,
            p_name: name || "Guest",
            p_phone: phone,
            p_is_priority: !!is_priority,
            p_staff_id: null // API creation
        });

        if (error) throw error;

        return NextResponse.json({ success: true, token: data }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
