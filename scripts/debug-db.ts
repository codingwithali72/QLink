
import { createClient } from '@supabase/supabase-js';
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
    console.log("--- DEBUGGING DB ---");

    // 1. ADMIN ACCESS (Bypass RLS)
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
    const localDateStr = serverDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    console.log("\nServer 'Today' (Asia/Kolkata):", localDateStr);

    // 3. CLIENT ACCESS (Simulate Browser / RLS)
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

    // 4. CHECK TOKENS
    if (clientSession) {
        const { data: tokens, error: tokenError } = await anonClient
            .from('tokens')
            .select('id, token_number, status')
            .eq('session_id', clientSession.id);
        console.log(`[CLIENT] Tokens found for session ${clientSession.id}:`, tokens?.length);
        if (tokenError) console.error("Client Token Error:", tokenError);
        else console.table(tokens?.slice(0, 5));
    } else {
        console.log("[CLIENT] Cannot check tokens because session was not found.");
    }
}

main();
