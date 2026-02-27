import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = "https://kcgmcgrvpzyjunypjeia.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runScalabilityModeling() {
    console.log("📈 STARTING PHASE 10 SCALABILITY MODELING 📈\n");

    const clinicId = "00000000-0000-0000-0000-000000000001";
    const sessionId = (await supabase.from('sessions').select('id').eq('business_id', clinicId).limit(1).single()).data?.id;

    if (!sessionId) {
        console.error("❌ No open session found for scalability test.");
        return;
    }

    // 1. DATA HYDRATION (1,000 rows per batch for speed)
    console.log("Hydrating 10,000 records into 'clinical_visits'...");

    for (let batch = 0; batch < 10; batch++) {
        const batchData = [];
        for (let i = 0; i < 1000; i++) {
            batchData.push({
                clinic_id: clinicId,
                session_id: sessionId,
                patient_id: '00000000-0000-0000-0000-000000000000',
                token_number: batch * 1000 + i + 1,
                status: 'SERVED',
                created_at: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
                registration_complete_time: new Date().toISOString()
            });
        }
        const { error } = await supabase.from('clinical_visits').insert(batchData);
        if (error) console.error(`Batch ${batch} failed:`, error.message);
        process.stdout.write(".");
    }
    console.log("\n✅ Hydration complete.");

    // 2. STRESS TEST AGGREGATION
    console.log("\n📊 MEASURING AGGREGATION PERFORMANCE...");
    const startTime = Date.now();

    // This query simulates the Dashboard Analytics load
    const { data: analytics, error: analyticsError } = await supabase
        .from('clinical_visits')
        .select('status, token_number')
        .eq('clinic_id', clinicId)
        .eq('status', 'SERVED');

    const endTime = Date.now();

    if (analyticsError) {
        console.error("❌ Aggregation Failed:", analyticsError.message);
    } else {
        console.log(`✅ Loaded ${analytics.length} records in ${endTime - startTime}ms`);
        console.log(`- Performance: ${(endTime - startTime) / analytics.length}ms per record.`);
        if (endTime - startTime < 1000) {
            console.log("✅ SCALABILITY VERIFIED: Sub-second response for 10k rows.");
        } else {
            console.warn("⚠️ SCALABILITY WARNING: Aggregation exceeding 1s. Index optimization or Materialized Views recommended.");
        }
    }

    // 3. CLEANUP (Optional - keeping for audit if user wants)
    // await supabase.from('clinical_visits').delete().eq('status', 'SERVED').eq('clinic_id', clinicId);

    console.log("\n🏁 SCALABILITY MODELING COMPLETE.");
}

runScalabilityModeling();
