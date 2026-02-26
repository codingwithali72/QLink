
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkAuthUsers() {
    console.log('Checking Auth Users in', supabaseUrl);
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('List Users failed:', error.message);
        process.exit(1);
    }

    console.log('Found total auth users:', users.length);
    users.forEach(u => {
        console.log(`- ${u.email} (ID: ${u.id})`);
    });

}

checkAuthUsers();
