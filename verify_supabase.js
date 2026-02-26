
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kcgmcgrvpzyjunypjeia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NDE3OTksImV4cCI6MjA4NjExNzc5OX0.3MqiMozgPfvK00paNUxdOKSsAcTBcNuMFD0r67epehw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For testing purposes if needed
    console.log('Testing connection to Supabase...');
    const { data: businesses, error } = await supabase.from('businesses').select('id, name, slug').limit(1);

    if (error) {
        console.error('Connection failed:', error.message);
        process.exit(1);
    }

    console.log('Connection successful!');
    console.log('Found businesses:', businesses);

    // Check if staff_users exists
    const { data: b2, error: staffError } = await supabase.from('staff_users').select('id, role').limit(1);
    console.log('staff_users check:', staffError ? 'Error: ' + staffError.message : 'OK (' + b2.length + ' rows)');
}

testConnection();
