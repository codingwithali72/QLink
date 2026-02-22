/**
 * test_concurrency.ts
 * Proves that the Daily Token Limit cannot be bypassed by race conditions.
 * Run via `npx tsx test_concurrency.ts`
 */
import { createToken } from './app/actions/queue';
import { createClient } from '@supabase/supabase-js';

// Initialize a bypass client just for test setup if needed, but we can just use the server action
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
    console.log("--- STARTING CONCURRENCY LIMIT TEST ---");

    // 1. Setup a test clinic or find an existing one
    const { data: biz } = await supabase.from('businesses').select('*').limit(1).single();
    if (!biz) {
        console.error("No business found to test.");
        return;
    }

    console.log(`Testing against Clinic: ${biz.name} (${biz.slug})`);

    // 2. Temporarily set the limit to 2 for this test
    console.log("Setting clinic daily token limit to 2...");
    await supabase.from('businesses').update({ daily_token_limit: 2 }).eq('id', biz.id);

    // 3. Clear today's tokens to ensure a clean slate for the limit test
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: session } = await supabase.from('sessions').select('id').eq('business_id', biz.id).eq('date', today).single();

    if (session) {
        console.log("Clearing today's active tokens for test session...");
        await supabase.from('tokens').delete().eq('session_id', session.id);
        await supabase.from('sessions').update({ last_token_number: 0 }).eq('id', session.id);
    }

    // 4. Fire 5 concurrent requests at the exact same millisecond
    console.log("Firing 5 concurrent createToken requests at the exact same time...");
    const requests = Array.from({ length: 5 }).map((_, i) =>
        createToken(biz.slug, `987654321${i}`, `Test User ${i}`)
    );

    const results = await Promise.all(requests);

    // 5. Analyze Results
    let successCount = 0;
    let limitReachedCount = 0;

    results.forEach((res, index) => {
        if (res.success) {
            successCount++;
            console.log(`[Request ${index}] SUCCESS - Token #${res.token?.token_number}`);
        } else if (res.limit_reached) {
            limitReachedCount++;
            console.log(`[Request ${index}] BLOCKED - Limit Reached (${res.error})`);
        } else {
            console.log(`[Request ${index}] FAILED - ${res.error}`);
        }
    });

    console.log("\n--- TEST SUMMARY ---");
    console.log(`Expected Successes: 2 (Limit is 2)`);
    console.log(`Actual Successes: ${successCount}`);
    console.log(`Blocked by Limit: ${limitReachedCount}`);

    if (successCount === 2 && limitReachedCount === 3) {
        console.log("✅ Concurrency Lock Test PASSED: Database successfully serialized requests and enforced the hard limit.");
    } else {
        console.error("❌ Concurrency Lock Test FAILED: Race condition bypass detected or limits not working.");
    }
}

runTest();
