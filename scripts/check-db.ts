
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../lib/supabase/admin';

async function checkDB() {
    const supabase = createAdminClient();

    console.log('--- FETCHING BUSINESSES ---');
    const { data: businesses, error: bError } = await supabase
        .from('businesses')
        .select('id, name, slug, is_active');

    if (bError) {
        console.error('Error fetching businesses:', bError);
    } else {
        console.log('Businesses:', businesses);
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
        console.log('Sessions:', sessions);
    }
}

checkDB().catch(console.error);
