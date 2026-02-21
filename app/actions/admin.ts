"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// C5 FIX: No fallback — if ADMIN_EMAIL env var is not set, nobody is superadmin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function isSuperAdmin() {
    if (!ADMIN_EMAIL) return false; // Fail closed — missing env = no admin access
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email === ADMIN_EMAIL;
}

async function getAdminEmail(): Promise<string | null> {
    if (!ADMIN_EMAIL) return null;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email === ADMIN_EMAIL ? user.email : null;
}

// ─── Admin Audit Logging ───────────────────────────────────────────────────
async function logAdminAction(
    action: string,
    targetType: string,
    targetId?: string,
    targetSlug?: string,
    metadata?: Record<string, unknown>
) {
    try {
        const supabase = createAdminClient();
        const email = await getAdminEmail();
        const ip = headers().get('x-forwarded-for') || headers().get('x-real-ip') || 'unknown';
        await supabase.from('admin_audit_logs').insert({
            action_type: action,
            target_type: targetType,
            target_id: targetId || null,
            target_slug: targetSlug || null,
            actor_email: email || 'unknown',
            actor_ip: ip,
            metadata: metadata || {},
        });
    } catch (e) {
        console.error('[logAdminAction] Failed to log:', e);
        // Never block the main action due to audit log failure
    }
}

export async function createBusiness(name: string, slug: string, phone: string, email?: string, password?: string, existingUserId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    // 1. Verify existing user UUID BEFORE proceeding
    if (existingUserId) {
        const { data: userObj, error: userErr } = await supabase.auth.admin.getUserById(existingUserId);
        if (userErr || !userObj.user) {
            return { error: "Invalid UUID: Cannot find a Supabase Auth user with that ID." };
        }
    }

    // 2. Check if slug exists
    const { data: existing } = await supabase.from('businesses').select('id').eq('slug', slug).single();
    if (existing) return { error: "Slug already exists" };

    let targetUserId = existingUserId;
    let createdNewUser = false;

    // 3. Create Auth User First (if new account needed)
    if (!targetUserId && email && password) {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError || !authData.user) {
            return { error: authError?.message || "Failed to create auth user. Email might be in use." };
        }

        targetUserId = authData.user.id;
        createdNewUser = true;
    }

    if (!targetUserId) {
        return { error: "No user ID provided or created." };
    }

    // 4. Create Business
    const { data: newBusiness, error: bizError } = await supabase.from('businesses').insert({
        name,
        slug,
        contact_phone: phone,
        settings: {
            plan: 'FREE',
            qr_intake_enabled: true,
            daily_token_limit: 200,
            max_active_tokens: 50,
            daily_message_limit: 300,
            whatsapp_enabled: true,
            retention_days: 90,
            billing_status: 'ACTIVE',
        }
    }).select('id').single();

    if (bizError || !newBusiness) {
        if (createdNewUser) await supabase.auth.admin.deleteUser(targetUserId);
        return { error: bizError?.message || "Failed to create business" };
    }

    // 5. Link Auth to Clinic as OWNER
    const { error: staffError } = await supabase.from('staff_users').insert({
        id: targetUserId,
        business_id: newBusiness.id,
        name: `${name} Owner`,
        role: 'OWNER'
    });

    if (staffError) {
        if (createdNewUser) await supabase.auth.admin.deleteUser(targetUserId);
        await supabase.from('businesses').delete().eq('id', newBusiness.id);
        return { error: staffError.message };
    }

    await logAdminAction('CREATE_CLINIC', 'BUSINESS', newBusiness.id, slug, { name, email });
    revalidatePath('/admin');
    return { success: true };
}

export async function toggleBusinessStatus(id: string, currentStatus: boolean) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    const newStatus = !currentStatus;
    const { error } = await supabase.from('businesses')
        .update({ is_active: newStatus, status: newStatus ? 'ACTIVE' : 'SUSPENDED' })
        .eq('id', id);
    if (error) return { error: error.message };
    await logAdminAction(newStatus ? 'ACTIVATE_CLINIC' : 'SUSPEND_CLINIC', 'BUSINESS', id);
    revalidatePath('/admin');
    return { success: true };
}

export async function resetBusinessSession(businessId: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // SAFETY GUARD: Block reset if a patient is currently SERVING
    const { data: activeSession } = await supabase
        .from('sessions').select('id').eq('business_id', businessId).eq('date', today)
        .in('status', ['OPEN', 'PAUSED']).maybeSingle();

    if (activeSession) {
        const { data: serving } = await supabase
            .from('tokens').select('id').eq('session_id', activeSession.id)
            .eq('status', 'SERVING').maybeSingle();
        if (serving) {
            return { error: "Cannot reset session while a patient is currently being served. Ask staff to press NEXT first." };
        }
    }

    const { error } = await supabase.from('sessions')
        .update({ status: 'CLOSED' })
        .eq('business_id', businessId)
        .eq('date', today);
    if (error) return { error: error.message };
    await logAdminAction('RESET_SESSION', 'SESSION', businessId, undefined, { date: today });
    revalidatePath('/admin');
    return { success: true };
}

export async function deleteBusiness(id: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    // SAFETY GUARD: Block delete if clinic has active queue tokens
    const { count: activeTokens } = await supabase
        .from('tokens').select('id', { count: 'exact', head: true })
        .eq('business_id', id)
        .in('status', ['WAITING', 'SERVING']);

    if ((activeTokens || 0) > 0) {
        return { error: `Cannot delete clinic with ${activeTokens} active token(s) in queue. Close the session first.` };
    }

    // Find staff users (auth users) before deleting business
    const { data: staffUsers } = await supabase.from('staff_users').select('id').eq('business_id', id);
    const { data: biz } = await supabase.from('businesses').select('slug, name').eq('id', id).single();

    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) return { error: error.message };

    // Clean up auth.users (Supabase Auth)
    if (staffUsers && staffUsers.length > 0) {
        for (const staff of staffUsers) {
            await supabase.auth.admin.deleteUser(staff.id);
        }
    }

    await logAdminAction('DELETE_CLINIC', 'BUSINESS', id, biz?.slug, { name: biz?.name });
    revalidatePath('/admin');
    return { success: true };
}

// Update clinic settings (plan, limits, toggles)
export async function updateBusinessSettings(id: string, settings: Record<string, unknown>) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    // Merge with existing settings (do not overwrite unrelated keys)
    const { data: biz } = await supabase.from('businesses').select('settings, slug').eq('id', id).single();
    const merged = { ...(biz?.settings as Record<string, unknown> || {}), ...settings };

    const { error } = await supabase.from('businesses').update({ settings: merged }).eq('id', id);
    if (error) return { error: error.message };
    await logAdminAction('UPDATE_SETTINGS', 'BUSINESS', id, biz?.slug, { changed: Object.keys(settings) });
    revalidatePath('/admin');
    return { success: true };
}

// Get admin audit log (last 100 actions)
export async function getAdminAuditLog(businessId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    let query = supabase.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (businessId) query = query.eq('target_id', businessId);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { logs: data || [] };
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
    const { count: failedMessages } = await supabase.from('message_logs').select('id', { count: 'exact', head: true }).gte('created_at', today).in('status', ['FAILED', 'PERMANENTLY_FAILED']);
    const { count: activeQueues } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).in('status', ['WAITING', 'SERVING']);

    return {
        businesses: businesses || [],
        activeSessions: activeSessions || 0,
        todayTokens: todayTokens || 0,
        totalMessages: totalMessages || 0,
        failedMessagesToday: failedMessages || 0,
        activeQueueTokens: activeQueues || 0,
    };
}

export async function getAnalytics(dateFrom?: string, dateTo?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    // Build token query
    let query = supabase.from('tokens').select('status, rating, created_at, served_at');
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

    const { data: tokens } = await query;
    const rows = tokens || [];

    const totalCreated = rows.length;
    const totalServed = rows.filter(t => t.status === 'SERVED').length;
    const totalCancelled = rows.filter(t => t.status === 'CANCELLED').length;
    const totalSkipped = rows.filter(t => t.status === 'SKIPPED').length;

    // Average rating (only tokens with a rating)
    const ratedTokens = rows.filter(t => t.rating !== null && t.rating > 0);
    const avgRating = ratedTokens.length
        ? (ratedTokens.reduce((sum, t) => sum + (t.rating || 0), 0) / ratedTokens.length).toFixed(1)
        : null;

    // Average wait time in minutes (created_at → served_at)
    const servedWithTimes = rows.filter(t => t.status === 'SERVED' && t.served_at && t.created_at);
    const avgWaitMins = servedWithTimes.length
        ? Math.round(servedWithTimes.reduce((sum, t) => {
            const diff = (new Date(t.served_at!).getTime() - new Date(t.created_at).getTime()) / 60000;
            return sum + diff;
        }, 0) / servedWithTimes.length)
        : null;

    // Time saved: assume 20 min avg physical queue wait per served patient
    const AVG_QUEUE_WAIT_MINS = 20;
    const timeSavedMins = totalServed * AVG_QUEUE_WAIT_MINS;
    const timeSavedHours = Math.floor(timeSavedMins / 60);
    const timeSavedRemainder = timeSavedMins % 60;

    return {
        totalCreated,
        totalServed,
        totalCancelled,
        totalSkipped,
        avgRating,
        avgWaitMins,
        timeSavedMins,
        timeSavedLabel: timeSavedHours > 0
            ? `${timeSavedHours}h ${timeSavedRemainder}m`
            : `${timeSavedMins}m`,
    };
}
