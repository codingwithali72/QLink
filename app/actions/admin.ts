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

export async function createBusiness(name: string, slug: string, phone: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    // Check if slug exists
    const { data: existing } = await supabase.from('businesses').select('id').eq('slug', slug).single();
    if (existing) return { error: "Slug already exists" };

    const { error } = await supabase.from('businesses').insert({
        name,
        slug,
        contact_phone: phone,
        settings: {}
    });

    if (error) return { error: error.message };
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
