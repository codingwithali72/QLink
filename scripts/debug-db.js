
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual Env Parsing
const envPath = path.resolve(__dirname, '../.env.local');
let env = {};
try {
    const data = fs.readFileSync(envPath, 'utf8');
    data.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim().replace(/"/g, ''); // Remove quotes if any
        }
    });
} catch (e) {
    console.error("Error reading .env.local", e);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase env vars (manual parse)");
    console.log("Found keys:", Object.keys(env));
    process.exit(1);
}

async function main() {
    console.log("--- DEBUGGING DB (Manual Env) ---");

    // 1. ADMIN ACCESS
    console.log("\n[ADMIN] Fetching Sessions for 'prime-care'...");
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: clinic } = await adminClient.from('clinics').select('id, slug').eq('slug', 'prime-care').single();
    if (!clinic) { console.error("Clinic not found"); return; }
    console.log("Clinic ID:", clinic.id);

    const { data: allSessions } = await adminClient.from('sessions')
        .select('*')
        .eq('clinic_id', clinic.id)
        .order('date', { ascending: false });

    console.log("All Sessions (Admin):");
    console.table(allSessions);

    // 2. CHECK "TODAY" GENERATION
    const serverDate = new Date();
    // Assuming server has proper ICU data, but since we are running locally on Windows it uses system ICU. 
    // We hope it supports 'Asia/Kolkata'.
    const localDateStr = serverDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    console.log("\nServer 'Today' (Asia/Kolkata):", localDateStr);

    // 3. CLIENT ACCESS
    console.log("\n[CLIENT] Fetching Session for 'Today'...");
    const anonClient = createClient(supabaseUrl, supabaseKey);

    const { data: clientSession, error: clientError } = await anonClient
        .from('sessions')
        .select('*')
        .eq('clinic_id', clinic.id)
        .eq('date', localDateStr)
        .single();

    if (clientError) console.error("Client Error:", clientError);
    else console.log("Client Session Found:", clientSession?.id);
}

main();
