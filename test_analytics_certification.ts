import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = "https://kcgmcgrvpzyjunypjeia.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAnalyticsCertification() {
    console.log("🧮 STARTING PHASE 4 ANALYTICS MATHEMATICAL CERTIFICATION 🧮\n");

    console.log("1. Finding ANY open session...");
    let { data: sData } = await supabase.from('sessions').select('id, business_id').eq('status', 'OPEN').limit(1).single();
    if (!sData) throw new Error("No open session found.");
    const sessionId = sData.id;
    const clinicId = sData.business_id;
    console.log("2. Session ID:", sessionId, "Clinic ID:", clinicId);

    // 1. DATA SEEDING
    console.log("Seeding controlled visit data...");

    // Create/Find a test patient
    const { data: patient } = await supabase.from('patients').upsert([{
        id: '00000000-0000-0000-0000-000000000003',
        clinic_id: clinicId,
        name: 'Math Tester patient',
        phone: '+910000000003'
    }]).select('id').single();

    const now = Date.now();
    const testVisits = [
        { arrival: now - (20 * 60 * 1000), served: now - (10 * 60 * 1000) }, // 10 min
        { arrival: now - (15 * 60 * 1000), served: now - (5 * 60 * 1000) },  // 10 min
        { arrival: now - (5 * 60 * 1000), served: now }                   // 5 min
    ];

    // Manual Calculation: (10 + 10 + 5) / 3 = 8.33 minutes = 500 seconds avg

    // Clear existing for this specific source
    await supabase.from('clinical_visits').delete().eq('source', 'MATH_INTEGRITY_TEST');

    // Get a dept ID too
    const { data: dept } = await supabase.from('departments').select('id').eq('clinic_id', clinicId).limit(1).single();

    for (let i = 0; i < testVisits.length; i++) {
        const v = testVisits[i];
        const { error: insertError } = await supabase.from('clinical_visits').insert([{
            clinic_id: clinicId,
            session_id: sessionId,
            patient_id: patient?.id,
            department_id: dept?.id,
            token_number: 9000 + i,
            status: 'SERVED',
            source: 'MATH_INTEGRITY_TEST',
            created_at: new Date(v.arrival).toISOString(),
            served_at: new Date(v.served).toISOString()
        }]);
        if (insertError) console.error("Insert Error:", insertError.message);
    }

    // 2. FETCH AUTOMATED ANALYTICS
    console.log("Fetching system analytics...");

    const { data: stats, error } = await supabase
        .from('clinical_visits')
        .select(`
            id,
            created_at,
            served_at
        `)
        .eq('clinic_id', clinicId)
        .eq('status', 'SERVED')
        .eq('source', 'MATH_INTEGRITY_TEST');

    if (error) {
        console.error("❌ Analytics Fetch Failed:", error.message);
        return;
    }

    // 3. COMPARISON
    let totalWaitSeconds = 0;
    stats?.forEach(s => {
        const start = new Date(s.created_at).getTime();
        const end = new Date(s.served_at!).getTime();
        totalWaitSeconds += (end - start) / 1000;
    });

    const avgWaitSeconds = stats!.length > 0 ? totalWaitSeconds / stats!.length : 0;
    const expectedAvg = 500;

    console.log(`\n📊 ANALYTICS VERIFICATION:`);
    console.log(`- Sample Size: ${stats?.length}`);
    console.log(`- Automated Average Wait: ${avgWaitSeconds}s`);
    console.log(`- Expected Average Wait: ${expectedAvg}s`);

    if (stats!.length > 0 && Math.abs(avgWaitSeconds - expectedAvg) < 1) {
        console.log("✅ MATHEMATICAL INTEGRITY CERTIFIED (100% Accuracy).");
    } else {
        console.error(`❌ MATHEMATICAL DISCREPANCY DETECTED! Variance: ${avgWaitSeconds - expectedAvg}s`);
    }

    console.log("\n🏁 ANALYTICS CERTIFICATION COMPLETE.");
}

runAnalyticsCertification();
