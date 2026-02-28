const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kcgmcgrvpzyjunypjeia.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runStressTest() {
    console.log("Starting Concurrency Stress Test...");

    // 1. Get primecare clinic ID
    const { data: business } = await supabase.from('businesses').select('id').eq('slug', 'primecare').single();
    if (!business) return console.log("Clinic not found");
    const clinicId = business.id;

    // 2. Get active session
    const today = new Date().toISOString().split('T')[0];
    let { data: session } = await supabase.from('sessions').select('id').eq('business_id', clinicId).eq('date', today).maybeSingle();

    if (!session) {
        console.log("No active session for primecare. Creating one...");
        const { data: newSession } = await supabase.from('sessions').insert({
            business_id: clinicId,
            date: today,
            status: 'OPEN'
        }).select('id').single();
        session = newSession;
    }

    // Test 1: Rapid Token Creation (50 tokens concurrently)
    console.log(`\n--- TEST 1: Rapid Token Creation (50 concurrent) ---`);
    const creationPromises = [];
    for (let i = 0; i < 50; i++) {
        creationPromises.push(
            supabase.rpc('rpc_create_clinical_visit', {
                p_clinic_id: clinicId,
                p_session_id: session.id,
                p_patient_name: `Stress Test Patient ${i}`,
                p_patient_phone: `9320202${String(i).padStart(3, '0')}`,
                p_phone_encrypted: null,
                p_phone_hash: null,
                p_department_id: null,
                p_requested_doctor_id: null,
                p_visit_type: 'OPD',
                p_is_priority: i % 10 === 0, // Every 10th is priority
                p_staff_id: null,
                p_source: 'QR'
            })
        );
    }

    const creationStart = Date.now();
    const creationResults = await Promise.all(creationPromises);
    const creationEnd = Date.now();

    let createdCount = 0;
    let failedCount = 0;
    creationResults.forEach(r => {
        if (r.data && r.data.success) createdCount++;
        else failedCount++;
    });
    console.log(`Created: ${createdCount}, Failed/Locked/Duplicate: ${failedCount}`);
    console.log(`Time taken: ${creationEnd - creationStart}ms (${(creationEnd - creationStart) / 50}ms/req)`);

    // Check if token numbers are unique
    const { data: tokens } = await supabase.from('clinical_visits').select('token_number').eq('session_id', session.id);
    const tokenSet = new Set(tokens.map(t => t.token_number));
    console.log(`Total unique tokens in DB for session: ${tokenSet.size}, Total tokens retrieved: ${tokens.length}`);
    if (tokenSet.size !== tokens.length) {
        console.log("CRITICAL FAILURE: Duplicate token numbers detected in the database.");
    } else {
        console.log("SUCCESS: No duplicate token numbers detected.");
    }

    // Test 2: Concurrent Queue Actions (NEXT + CANCEL)
    console.log(`\n--- TEST 2: Race Condition on Queue Advancement (NEXT) ---`);
    // Attempt to call NEXT 5 times at the exact same moment. Only one should succeed, others should do nothing or fail safely.
    const getStaff = await supabase.from('staff_users').select('id').eq('business_id', clinicId).limit(1).maybeSingle();
    const staffId = getStaff.data?.id || (await supabase.auth.admin.listUsers()).data.users[0].id;

    const nextPromises = [];
    for (let i = 0; i < 5; i++) {
        nextPromises.push(
            supabase.rpc('rpc_process_clinical_action', {
                p_clinic_id: clinicId,
                p_session_id: session.id,
                p_staff_id: staffId,
                p_action: 'NEXT',
                p_visit_id: null
            })
        );
    }

    const nextResults = await Promise.all(nextPromises);
    let nextSuccess = 0;
    nextResults.forEach(r => { if (r.data && r.data.success) nextSuccess++; });
    console.log(`Concurrent NEXT operations succeeded: ${nextSuccess} (Expected close to 1 if concurrency lock is perfect, but depends on DB state).`);

}

runStressTest();
