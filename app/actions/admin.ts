"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@qlink.com";

async function isSuperAdmin() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email === ADMIN_EMAIL;
}

export async function createBusiness(name: string, slug: string, phone: string, email?: string, password?: string, existingUserId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    // Check if slug exists
    const { data: existing } = await supabase.from('businesses').select('id').eq('slug', slug).single();
    if (existing) return { error: "Slug already exists" };

    // Insert Business
    const { data: newBusiness, error: bizError } = await supabase.from('businesses').insert({
        name,
        slug,
        contact_phone: phone,
        settings: {}
    }).select('id').single();

    if (bizError || !newBusiness) return { error: bizError?.message || "Failed to create business" };

    let targetUserId = existingUserId;
    let createdNewUser = false;

    // Create Staff User Auth
    if (!targetUserId && email && password) {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError || !authData.user) {
            await supabase.from('businesses').delete().eq('id', newBusiness.id); // Rollback
            return { error: authError?.message || "Failed to create auth user" };
        }

        targetUserId = authData.user.id;
        createdNewUser = true;
    }

    if (targetUserId) {
        // Link Auth to Clinic
        const { error: staffError } = await supabase.from('staff_users').insert({
            id: targetUserId,
            business_id: newBusiness.id,
            name: `${name} Reception`,
            role: 'RECEPTIONIST'
        });

        if (staffError) {
            if (createdNewUser) {
                await supabase.auth.admin.deleteUser(targetUserId);
            }
            await supabase.from('businesses').delete().eq('id', newBusiness.id); // Rollback
            return { error: staffError.message };
        }
    } else {
        // Rollback business if no user ID was provided or created
        await supabase.from('businesses').delete().eq('id', newBusiness.id);
        return { error: "No user ID provided or created." };
    }

    revalidatePath('/admin');
    return { success: true };
}

export async function toggleBusinessStatus(id: string, currentStatus: boolean) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    const { error } = await supabase.from('businesses').update({ is_active: !currentStatus }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/admin');
    return { success: true };
}

export async function resetBusinessSession(businessId: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('sessions').update({ status: 'CLOSED' }).eq('business_id', businessId).eq('date', today);
    if (error) return { error: error.message };
    revalidatePath('/admin');
    return { success: true };
}

export async function deleteBusiness(id: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    // Find staff users (auth users) before deleting business
    const { data: staffUsers } = await supabase.from('staff_users').select('id').eq('business_id', id);

    // Delete the business (this cascades to staff_users, sessions, tokens, etc. in Postgres)
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) return { error: error.message };

    // Clean up auth.users (Supabase Auth)
    if (staffUsers && staffUsers.length > 0) {
        for (const staff of staffUsers) {
            await supabase.auth.admin.deleteUser(staff.id);
        }
    }

    revalidatePath('/admin');
    return { success: true };
}

export async function getAdminStats() {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    // 1. Get Businesses
    const { data: businesses } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });

    const today = new Date().toISOString().split('T')[0];
    const { count: activeSessions } = await supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'OPEN');
    const { count: todayTokens } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).gte('created_at', today);
    const { count: totalMessages } = await supabase.from('message_logs').select('id', { count: 'exact', head: true });

    return {
        businesses: businesses || [],
        activeSessions: activeSessions || 0,
        todayTokens: todayTokens || 0,
        totalMessages: totalMessages || 0
    };
}
