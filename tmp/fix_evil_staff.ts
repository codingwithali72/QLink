import { createAdminClient } from '../lib/supabase/admin';

async function fix() {
    const supabase = createAdminClient();

    // 1. Get User ID
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('User error:', userError);
        return;
    }
    const evilUser = users.users.find(u => u.email === 'evil@clinic.com');
    if (!evilUser) {
        console.error('Evil user not found');
        return;
    }
    console.log('Found Evil User:', evilUser.id);

    // 2. Get Business ID
    const { data: biz, error: bizError } = await supabase.from('businesses').select('id').eq('slug', 'evil-clinic').single();
    if (bizError) {
        console.error('Biz error:', bizError);
        return;
    }
    console.log('Found Evil Clinic:', biz.id);

    // 3. Check if link exists
    const { data: link } = await supabase.from('staff_users').select('*').eq('id', evilUser.id).maybeSingle();
    if (link) {
        console.log('Link already exists:', link);
        if (link.business_id !== biz.id) {
            console.log('Fixing business_id...');
            await supabase.from('staff_users').update({ business_id: biz.id }).eq('id', evilUser.id);
        }
    } else {
        console.log('Creating link...');
        const { error: insertError } = await supabase.from('staff_users').insert({
            id: evilUser.id,
            business_id: biz.id,
            name: 'Evil Owner',
            role: 'OWNER'
        });
        if (insertError) console.error('Insert error:', insertError);
        else console.log('Successfully linked!');
    }
}

fix();
