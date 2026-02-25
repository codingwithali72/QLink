const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function runChaosTest() {
    console.log("🔥 INITIATING PHASE 2/3/5/18 CHAOS TEST");

    // 1. Get Business ID
    const { data: business } = await supabase.from('businesses').select('id').eq('slug', 'we-care').single();
    if (!business) {
        console.error("Clinic WE-CARE not found!");
        return;
    }
    const businessId = business.id;

    // 2. Get Active Session
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: session } = await supabase.from('sessions')
        .select('id')
        .eq('business_id', businessId)
        .eq('date', todayStr)
        .eq('status', 'OPEN')
        .maybeSingle();

    if (!session) {
        console.error("No OPEN session today for we-care. Please create one in the UI first.");
        return;
    }
    const sessionId = session.id;
    console.log(`✅ Session ID secured: ${sessionId}`);

    console.log("🚀 FIRING 100 SIMULTANEOUS TOKEN CREATIONS (RACE CONDITION BARRAGE)...");

    const startTime = Date.now();
    const promises = [];
    const CONCURRENCY_LIMIT = 100;

    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        const isPriority = Math.random() > 0.9; // 10% chance of emergency token
        promises.push(
            (async () => {
                try {
                    return await supabase.rpc('create_token_atomic', {
                        p_session_id: sessionId,
                        p_business_id: businessId,
                        p_patient_name: `Chaos Bot ${i}`,
                        p_patient_phone: `910000000${(i % 100).toString().padStart(2, '0')}`,
                        p_is_priority: isPriority
                    });
                } catch (err) {
                    return { error: err };
                }
            })()
        );
    }

    const results = await Promise.allSettled(promises);
    const endTime = Date.now();

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.data).length;
    const dbErrorsCount = results.filter(r => r.status === 'fulfilled' && r.value.error).length;
    const codeErrorsCount = results.filter(r => r.status === 'rejected').length;

    console.log(`⏱️ 100 Tokens processed in ${endTime - startTime}ms (Avg: ${(endTime - startTime) / CONCURRENCY_LIMIT}ms per request)`);
    console.log(`📊 SUCCESS: ${successCount}`);
    console.log(`📊 DB REJECTIONS (Limits/Locks): ${dbErrorsCount}`);
    console.log(`📊 CODE CRASHES: ${codeErrorsCount}`);

    // 2. Fetch all tokens created today for verification
    console.log("🔍 FETCHING TOKENS FOR INVARIANT CHECK...");
    const { data: tokens, error: tokensError } = await supabase
        .from('tokens')
        .select('id, token_number, is_priority')
        .eq('session_id', sessionId);

    if (tokensError) {
        console.error("Failed to fetch tokens", tokensError);
    } else {
        console.log(`Total Tokens In DB for Session: ${tokens.length}`);
        const tokenNumbers = tokens.map(t => t.token_number);
        const uniqueTokens = new Set(tokenNumbers);

        if (tokens.length !== uniqueTokens.size) {
            console.error("❌ CRITICAL FAILURE: DUPPLICATE TOKEN NUMBERS DETECTED!");
            // Find duplicates
            const dupes = tokenNumbers.filter((item, index) => tokenNumbers.indexOf(item) !== index);
            console.error("Duplicates:", dupes);
        } else {
            console.log("✅ RACE CONDITION DEFEATED: 0 DUPLICATE TOKEN NUMBERS.");
        }
    }
}

runChaosTest();
