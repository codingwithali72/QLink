
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seedStaff() {
    console.log('Seeding staff link for Prime-care...');

    // Business ID from previous check
    const businessId = 'a6736bf9-a24f-4f63-ab9f-c0fc448cb3ef';
    const userId = '3fa26d1c-30f2-47bf-8921-88729215a4a8'; // codingwithali72@gmail.com

    const { data, error } = await supabase
        .from('staff_users')
        .insert({
            id: userId,
            business_id: businessId,
            name: 'Hussain Admin',
            role: 'OWNER'
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            console.log('Staff link already exists.');
        } else {
            console.error('Seed failed:', error.message);
            process.exit(1);
        }
    } else {
        console.log('Seed successful!', data);
    }
}

seedStaff();
