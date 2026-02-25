
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
    console.log('--- FETCHING BUSINESSES ---');
    const { data: businesses, error: bError } = await supabase
        .from('businesses')
        .select('id, name, slug, is_active');

    if (bError) {
        console.error('Error fetching businesses:', bError);
    } else {
        console.log('Businesses:', JSON.stringify(businesses, null, 2));
    }

    console.log('\n--- FETCHING RECENT SESSIONS ---');
    const { data: sessions, error: sError } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: false })
        .limit(5);

    if (sError) {
        console.error('Error fetching sessions:', sError);
    } else {
        console.log('Sessions:', JSON.stringify(sessions, null, 2));
    }
}

checkDB().catch(console.error);
