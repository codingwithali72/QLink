const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kcgmcgrvpzyjunypjeia.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkMetrics() {
    console.log("Starting DB Forensics...");

    // 1. Get total tokens for today
    const { count: totalCreated, error: e1 } = await supabase
        .from('clinical_visits')
        .select('*', { count: 'exact', head: true });

    // 2. Get active tokens
    const { count: active, error: e2 } = await supabase
        .from('clinical_visits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'WAITING');

    // 3. Get served tokens
    const { count: served, error: e3 } = await supabase
        .from('clinical_visits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'SERVED');

    // 4. Get cancelled
    const { count: cancelled, error: e4 } = await supabase
        .from('clinical_visits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'CANCELLED');

    console.log(`Metrics (All Time):`);
    console.log(`Total Created: ${totalCreated}`);
    console.log(`Active (Waiting): ${active}`);
    console.log(`Served: ${served}`);
    console.log(`Cancelled: ${cancelled}`);

    // Check for duplicates (same number in same session)
    const { data: visits, error: e5 } = await supabase
        .from('clinical_visits')
        .select('token_number, session_id');

    if (visits) {
        const dupMap = {};
        visits.forEach(v => {
            const key = `${v.session_id}_${v.token_number}`;
            dupMap[key] = (dupMap[key] || 0) + 1;
        });

        console.log('\nDuplicate Token Check:');
        let dupFound = false;
        Object.entries(dupMap).forEach(([key, count]) => {
            if (count > 1) {
                console.log(`Session_Token ${key}: ${count} occurrences (DUPLICATE FOUND!)`);
                dupFound = true;
            }
        });
        if (!dupFound) console.log("No duplicates found according to database check.");
    } else {
        console.error("Failed to fetch visits:", e5);
    }
}

checkMetrics();
