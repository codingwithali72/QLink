import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBusinessId } from '@/app/actions/queue';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clinicSlug = searchParams.get('clinicSlug');
    const date = searchParams.get('date');
    const cursor = searchParams.get('cursor'); // expects token_number
    const limitParams = searchParams.get('limit');

    if (!clinicSlug || !date) {
        return NextResponse.json({ error: 'Missing clinicSlug or date' }, { status: 400 });
    }

    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const businessId = await getBusinessId(clinicSlug);
        if (!businessId) {
            return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
        }

        const { data: session } = await supabase
            .from('sessions')
            .select('id')
            .eq('business_id', businessId)
            .eq('date', date)
            .maybeSingle();

        if (!session) {
            return NextResponse.json({ tokens: [], nextCursor: null });
        }

        const limit = limitParams ? parseInt(limitParams, 10) : 50;

        let query = supabase
            .from('clinical_visits')
            .select('id, token_number, status, is_priority, rating, feedback, created_at, patients(name, phone, phone_encrypted)')
            .eq('session_id', session.id)
            .order('token_number', { ascending: false })
            .limit(limit);

        if (cursor) {
            const cursorTokenNumber = parseInt(cursor, 10);
            query = query.lt('token_number', cursorTokenNumber);
        }

        const { data, error } = await query;
        if (error) throw error;

        const tokens = (data || []).map((v) => {
            const visit = v as {
                id: string;
                token_number: number;
                status: string;
                is_priority: boolean;
                rating: number | null;
                feedback: string | null;
                created_at: string;
                patients?: { name?: string; phone?: string; phone_encrypted?: string } | null;
            };
            return {
                id: visit.id,
                tokenNumber: visit.token_number,
                customerName: visit.patients?.name || 'Unknown',
                status: visit.status,
                isPriority: visit.is_priority,
                rating: visit.rating,
                feedback: visit.feedback,
                createdAt: visit.created_at,
            };
        });

        const nextCursor = tokens.length === limit ? tokens[tokens.length - 1].tokenNumber : null;

        return NextResponse.json({ tokens, nextCursor });
    } catch (e: unknown) {
        console.error("History API Error:", e);
        const errMessage = e instanceof Error ? e.message : 'Server Error';
        return NextResponse.json({ error: errMessage }, { status: 500 });
    }
}
