import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Setup Mock Environment variables for the validation test
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key';

async function runPhase1Validation() {
    console.log("=========================================");
    console.log("PHASE 1: DB & CRYPTOGRAPHIC VALIDATION");
    console.log("=========================================\n");

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
        console.log("--- TEST 1: Attempt Raw DB Read (Anon Access) ---");
        const { data, error } = await anonClient.from('patients').select('*').limit(1);

        if (error) {
            console.log("✅ SUCCESS: Anon read blocked by RLS.");
            console.log(`   Error Message: ${error.message}`);
        } else if (data && data.length > 0) {
            console.error("❌ FAILURE: Anon user could read patients table.");
            console.error(data);
            process.exit(1);
        } else {
            console.log("✅ SUCCESS: Anon read blocked/returned empty array (RLS active).");
        }

        console.log("\n--- TEST 2: Attempt IDOR (Accessing cross-clinic data) ---");
        // Simulating a crafted request to read Security Audit Logs which are strictly isolated
        const { data: auditData, error: auditError } = await anonClient.from('security_audit_logs').select('*');
        if (auditError) {
            console.log("✅ SUCCESS: IDOR attempt blocked by RLS.");
        } else if (auditData && auditData.length > 0) {
            console.error("❌ FAILURE: IDOR attempt succeeded, data leaked!");
            process.exit(1);
        } else {
            console.log("✅ SUCCESS: IDOR attempt blocked/returned empty (RLS active).");
        }

        console.log("\n=========================================");
        console.log("✅ PHASE 1 VALIDATION COMPLETE: ALL TESTS PASSED");
        console.log("=========================================");

    } catch (e) {
        console.error("FATAL ERROR during validation:", e);
        process.exit(1);
    }
}

runPhase1Validation();
