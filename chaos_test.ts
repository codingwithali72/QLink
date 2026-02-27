import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = "https://kcgmcgrvpzyjunypjeia.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runChaosTest() {
    try {
        console.log("🔥 STARTING QLINK CHAOS TEST: PHASE 2 & 8 (CONCURRENCY DESTRUCTION) 🔥");

        // 1. Setup Data - Auto-Seeding required foreign keys
        console.log("Setting up mock hospital data...");

        console.log("1. Finding ANY open session...");
        let { data: sData } = await supabase.from('sessions').select('id, business_id').eq('status', 'OPEN').limit(1).single();
        if (!sData) throw new Error("No open session found");
        const sessionId = sData.id;
        const clinicId = sData.business_id;
        console.log("2. Session ID:", sessionId, "Clinic ID:", clinicId);

        console.log("3. Finding existing department for this clinic...");
        let { data: deptData } = await supabase.from('departments').select('id').eq('clinic_id', clinicId).limit(1).single();
        if (!deptData) {
            console.log("Creating default department for clinic...");
            const { data: newDept } = await supabase.from('departments').insert({ clinic_id: clinicId, name: 'General OPD', routing_strategy: 'POOLED' }).select('id').single();
            deptData = newDept;
        }
        const deptId = deptData!.id;
        console.log("4. Dept ID:", deptId);

        console.log(`Target Session: ${sessionId} | Target Dept: ${deptId}`);

        // 2. The Burst (Simulating 50 receptionists clicking "Add Walk-In" at the exact same millisecond)
        console.log(`\n🚀 FIRING 100 CONCURRENT REQUESTS (Simulation: Double Clicks & Cross-Receptionist Race Conditions)`);

        const burstPromises = [];
        const startTime = Date.now();

        for (let i = 0; i < 100; i++) {
            const req = supabase.rpc('rpc_create_clinical_visit', {
                p_clinic_id: clinicId,
                p_session_id: sessionId,
                p_patient_name: `Chaos Tester ${i}`,
                p_patient_phone: `+9199999000${i.toString().padStart(2, '0')}`,
                p_phone_encrypted: null,
                p_phone_hash: null,
                p_department_id: deptId,
                p_is_priority: false,
                p_source: 'WALK_IN'
            });
            burstPromises.push(req);
        }

        const results = await Promise.all(burstPromises);
        const endTime = Date.now();

        console.log(`\n⏱️ BURST COMPLETE in ${endTime - startTime}ms`);

        // 3. Validation
        let successes = 0;
        let errors = 0;
        let tokens: number[] = [];

        for (const res of results) {
            if (res.error) {
                errors++;
                console.error("Supabase Error:", res.error.message);
            } else if (res.data && res.data.success === false) {
                errors++;
                console.error("Logic Error:", res.data.error);
            } else if (res.data && res.data.success === true) {
                successes++;
                tokens.push(res.data.token_number);
            }
        }

        // Sort tokens to check for duplicates
        tokens.sort((a, b) => a - b);
        const uniqueTokens = new Set(tokens);

        console.log(`\n📊 RESULTS:`);
        console.log(`- Total Requests: 50`);
        console.log(`- Successes: ${successes}`);
        console.log(`- Errors/Rejections: ${errors}`);
        console.log(`- Duplicate Tokens Generated: ${tokens.length - uniqueTokens.size}`);

        if (tokens.length > 0) {
            console.log(`- Token Sequence Generated: ${tokens[0]} to ${tokens[tokens.length - 1]}`);

            let hasGaps = false;
            let prev = tokens[0] - 1;
            for (const t of tokens) {
                if (t !== prev + 1) {
                    console.log(`⚠️ SEQUENCE GAP FOUND between ${prev} and ${t}`);
                    hasGaps = true;
                }
                prev = t;
            }
            if (!hasGaps) {
                console.log(`✅ EXACT MATHEMATICAL SEQUENCE VALIDATED. NO GAPS.`);
            }
        }

        const report = {
            total: 100,
            successes,
            errors,
            duration: endTime - startTime,
            tokens: tokens,
            uniqueTokens: uniqueTokens.size,
            isIsolated: tokens.length - uniqueTokens.size === 0
        };
        fs.writeFileSync('chaos_results.json', JSON.stringify(report, null, 2));

        if (tokens.length - uniqueTokens.size === 0) {
            console.log(`✅ ISOLATION VALIDATED. NO DUPLICATE TOKENS ISSUED.`);
        } else {
            console.error(`❌ RACE CONDITION DETECTED! DUPLICATE TOKENS GENERATED!`);
        }
    } catch (e: any) {
        console.error("💥 FATAL SCRIPT ERROR:", e);
        if (e.message) console.error("Error Message:", e.message);
        if (e.stack) console.error("Stack Trace:", e.stack);
    }
}

runChaosTest();
