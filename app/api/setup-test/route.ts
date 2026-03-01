import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { data: clinics, error } = await supabase.from('businesses').select('*').eq('slug', 'panvel-test');
        if (error) throw error;
        if (!clinics || clinics.length === 0) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

        const clinicId = clinics[0].id;
        const log: string[] = [];

        // Departments
        const deptNames = ['Cardiology', 'Radiology', 'Pediatrics'];
        const deptIds: Record<string, string> = {};
        for (const d of deptNames) {
            const { data: existing } = await supabase.from('departments').select('*').eq('clinic_id', clinicId).eq('name', d);
            if (!existing || existing.length === 0) {
                const { data: ins, error: err } = await supabase.from('departments').insert({ clinic_id: clinicId, name: d, is_active: true, routing_strategy: 'POOLED' }).select();
                if (err) throw err;
                deptIds[d] = ins[0].id;
                log.push(`Created department ${d}`);
            } else {
                deptIds[d] = existing[0].id;
                log.push(`Found existing department ${d}`);
            }
        }

        // Doctors
        const docs = [
            { name: 'Dr A', department_id: deptIds['Cardiology'], specialization: 'Cardiology' },
            { name: 'Dr B', department_id: deptIds['Radiology'], specialization: 'Radiology' },
            { name: 'Dr C', department_id: deptIds['Pediatrics'], specialization: 'Pediatrics' }
        ];
        for (const doc of docs) {
            const { data: existing } = await supabase.from('doctors').select('*').eq('department_id', doc.department_id).eq('name', doc.name);
            if (!existing || existing.length === 0) {
                const { error: err } = await supabase.from('doctors').insert(doc);
                if (err) throw err;
                log.push(`Created doctor ${doc.name}`);
            } else {
                log.push(`Found existing doctor ${doc.name}`);
            }
        }

        // Session
        const today = new Date().toISOString().split('T')[0];
        const { data: sessions } = await supabase.from('sessions').select('*').eq('business_id', clinicId).eq('date', today);
        if (!sessions || sessions.length === 0) {
            const { error: err } = await supabase.from('sessions').insert({ business_id: clinicId, date: today, status: 'OPEN', last_token_number: 0, now_serving_number: 0 });
            if (err) throw err;
            log.push('Created new session for today');
        } else {
            log.push('Found existing session for today');
        }

        return NextResponse.json({ success: true, log });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
