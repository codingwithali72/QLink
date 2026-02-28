const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kcgmcgrvpzyjunypjeia.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZ21jZ3J2cHp5anVueXBqZWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU0MTc5OSwiZXhwIjoyMDg2MTE3Nzk5fQ.N0WRfmcDlK3gx66SpUEOMfPepLCVxAVPbjNA3sNnbF0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkClinics() {
    const { data: businesses, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error("Error fetching businesses:", error);
    } else {
        console.log("Businesses:", businesses.map(b => ({ slug: b.slug, id: b.id, name: b.name })));
    }
}

checkClinics();
