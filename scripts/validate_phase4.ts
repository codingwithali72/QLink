import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Setup Mock Environment variables for the validation test
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key';

async function runPhase4Validation() {
    console.log("=========================================");
    console.log("PHASE 4: PSQ KPI AUTOMATION ENGINE VALIDATION");
    console.log("=========================================\n");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    try {
        console.log("--- TEST 1: Simulate Negative Wait Time Prevention (Diagnostic Test) ---");

        const mockVisitId = '123e4567-e89b-12d3-a456-426614174001';

        console.log("Attempting to insert a diagnostic test where START time is BEFORE REQUISITION time...");

        const now = new Date();
        const past = new Date(now.getTime() - 60000); // 1 minute ago

        const { error: diagError } = await adminClient.from('diagnostic_tests').insert({
            visit_id: mockVisitId,
            test_name: 'MRI Brain',
            requisition_presented_time: now.toISOString(),
            test_start_time: past.toISOString() // Illegal!
        });

        if (diagError && diagError.message.includes('Constraint Violation: Diagnostic test started before requisition presented')) {
            console.log("✅ SUCCESS: Negative wait time blocked perfectly by DB Constraint.");
        } else {
            console.error("❌ FAILURE: DB allowed a negative wait time insertion.");
            console.error(diagError);
            process.exit(1);
        }

        console.log("\n--- TEST 2: Execute Monthly KPI Aggregation Cron ---");
        console.log("Triggering cron_aggregate_psq_kpis()...");

        const { error: cronError } = await adminClient.rpc('cron_aggregate_psq_kpis');

        if (cronError) {
            console.error("❌ FAILURE: KPI Aggregation Cron failed to execute.");
            console.error(cronError.message);
            process.exit(1);
        } else {
            console.log("✅ SUCCESS: Monthly KPI Math Engine triggered and executed.");
        }

        console.log("\n=========================================");
        console.log("✅ PHASE 4 VALIDATION COMPLETE: KPI AUTOMATION TESTED");
        console.log("=========================================");

    } catch (e) {
        console.error("FATAL ERROR during Phase 4 validation:", e);
        process.exit(1);
    }
}

runPhase4Validation();
