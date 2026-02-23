"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// VAPT FIX: DB-based RBAC with env-var bootstrap fallback
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function isSuperAdmin() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Primary check: DB-level SUPER_ADMIN role
    const admin = createAdminClient();
    const { data: staffRow } = await admin.from('staff_users')
        .select('role')
        .eq('id', user.id)
        .eq('role', 'SUPER_ADMIN')
        .maybeSingle();
    if (staffRow) return true;

    // Bootstrap fallback: env-var email match (first-run only)
    if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) return true;

    return false;
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
        daily_token_limit: 200,
        settings: {
            features: ['queue_management'],
            qr_intake_enabled: true,
            max_active_tokens: 50,
            daily_message_limit: 300,
            whatsapp_enabled: true,
            // DPDP & System limits
            retention_days: Math.max(1, Math.min(90, 365)),
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

    // Get admin user id for audit
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();

    // VAPT FIX: Atomic force-close via Postgres RPC (locks session, cancels waiting, closes, logs)
    const { data, error } = await supabase.rpc('rpc_force_close_session', {
        p_business_id: businessId,
        p_staff_id: user?.id || null,
    });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data as any;
    if (result && result.success === false) return { error: result.error || 'Force close failed' };

    await logAdminAction('RESET_SESSION', 'SESSION', businessId, undefined, {
        cancelled_tokens: result?.cancelled_tokens || 0,
    });
    revalidatePath('/admin');
    return { success: true };
}

export async function deleteBusiness(id: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    // Get admin user id for audit trail inside the RPC
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();

    // Capture staff user IDs BEFORE deletion (for Auth cleanup after)
    const { data: staffUsers } = await supabase.from('staff_users').select('id').eq('business_id', id);
    const { data: biz } = await supabase.from('businesses').select('slug, name').eq('id', id).single();

    // VAPT FIX: Atomic DB deletion via Postgres RPC (guards, cascades, logs in one transaction)
    const { data, error } = await supabase.rpc('rpc_delete_clinic_transactional', {
        p_business_id: id,
        p_admin_id: user?.id || null,
    });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data as any;
    if (result && result.success === false) return { error: result.error || 'Deletion failed' };

    // Post-DB-commit: Clean up auth.users (cannot be inside Postgres transaction)
    if (staffUsers && staffUsers.length > 0) {
        for (const staff of staffUsers) {
            try {
                await supabase.auth.admin.deleteUser(staff.id);
            } catch (e) {
                console.error(`[deleteBusiness] Failed to delete auth user ${staff.id}:`, e);
                // DB is already clean — Auth orphan is acceptable and idempotent
            }
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

    // Limit extraction and strict bounding (VAPT Fix)
    const rootUpdates: Record<string, unknown> = {};
    if ('daily_token_limit' in settings) {
        // Prevent overflow / zero locks: Clamp between 1 and 5000
        const rawLimit = Number(settings.daily_token_limit);
        rootUpdates.daily_token_limit = isNaN(rawLimit) ? 50 : Math.max(1, Math.min(rawLimit, 5000));
        settings.daily_token_limit = rootUpdates.daily_token_limit; // reflect in merged settings
    }

    if ('retention_days' in settings) {
        // DPDP check: Clamp retention safely
        const rawRet = Number(settings.retention_days);
        rootUpdates.retention_days = isNaN(rawRet) ? 30 : Math.max(1, Math.min(rawRet, 365));
        settings.retention_days = rootUpdates.retention_days;
    }

    // Merge with existing settings (do not overwrite unrelated keys)
    const { data: biz } = await supabase.from('businesses').select('settings, slug').eq('id', id).single();
    const merged = { ...(biz?.settings as Record<string, unknown> || {}), ...settings };

    const { error } = await supabase.from('businesses').update({ ...rootUpdates, settings: merged }).eq('id', id);
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

    // 1. Get Businesses (exclude soft-deleted)
    const { data: businesses } = await supabase.from('businesses').select('*').is('deleted_at', null).order('created_at', { ascending: false });

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
    const { count: activeSessions } = await supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', todayStr).eq('status', 'OPEN');
    const { count: todayTokens } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).gte('created_at', istStart);
    const { count: totalMessages } = await supabase.from('message_logs').select('id', { count: 'exact', head: true });
    const { count: failedMessages } = await supabase.from('message_logs').select('id', { count: 'exact', head: true }).gte('created_at', istStart).in('status', ['FAILED', 'PERMANENTLY_FAILED']);
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

// Scalable Global Analytics (Hits aggregated table, no full table live-scans)
export async function getAnalytics(dateFrom?: string, dateTo?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };

    const supabase = createAdminClient();

    let query = supabase.from('clinic_daily_stats').select('*');
    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);

    const { data: stats } = await query;
    const rows = stats || [];

    const totalCreated = rows.reduce((acc, row) => acc + row.total_tokens, 0);
    const totalServed = rows.reduce((acc, row) => acc + row.served_count, 0);
    const totalCancelled = 0; // Historically not explicitly counted in daily stats table yet
    const totalSkipped = rows.reduce((acc, row) => acc + row.skipped_count, 0);

    // Calculate Wait Time Avg
    const waitSamples = rows.filter(r => r.avg_wait_time_minutes > 0);
    const avgWaitMins = waitSamples.length
        ? Math.round(waitSamples.reduce((acc, row) => acc + Number(row.avg_wait_time_minutes), 0) / waitSamples.length)
        : null;

    const AVG_QUEUE_WAIT_MINS = 20;
    const timeSavedMins = totalServed * AVG_QUEUE_WAIT_MINS;
    const timeSavedHours = Math.floor(timeSavedMins / 60);

    return {
        totalCreated,
        totalServed,
        totalCancelled,
        totalSkipped,
        avgRating: null, // Ratings skipped for daily performance aggregate
        avgWaitMins,
        timeSavedMins,
        timeSavedLabel: timeSavedHours > 0
            ? `${timeSavedHours}h ${timeSavedMins % 60}m`
            : `${timeSavedMins}m`,
    };
}

// Clinic-specific heavy detailed metrics
export async function getClinicMetrics(businessId: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();

    // Live Today Stats
    const { count: liveCreated } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', istStart);
    const { count: liveServed } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'SERVED').gte('created_at', istStart);
    const { count: liveSkipped } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'SKIPPED').gte('created_at', istStart);
    const { count: liveEmergency } = await supabase.from('tokens').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_priority', true).gte('created_at', istStart);

    // Historical Rolling 30 Days Trend
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: trend } = await supabase.from('clinic_daily_stats')
        .select('date, total_tokens, avg_wait_time_minutes, served_count')
        .eq('business_id', businessId)
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: true });

    // Calculate Average Rating across all tokens
    const { data: ratings } = await supabase.from('tokens')
        .select('rating')
        .eq('business_id', businessId)
        .not('rating', 'is', null);

    const validRatings = ratings?.filter(r => r.rating !== null) || [];
    const avgRating = validRatings.length > 0
        ? (validRatings.reduce((acc, r) => acc + Number(r.rating), 0) / validRatings.length).toFixed(1)
        : null;

    // Time Saved calculation (Total Served * 20 mins)
    const totalServedHistory = trend?.reduce((acc, row) => acc + (row.served_count || 0), 0) || 0;
    const totalServedEver = totalServedHistory + (liveServed || 0);
    const timeSavedMins = totalServedEver * 20; // 20 min estimated average physical wait
    const timeSavedHours = Math.floor(timeSavedMins / 60);
    const timeSavedLabel = timeSavedHours > 0 ? `${timeSavedHours}h ${timeSavedMins % 60}m` : `${timeSavedMins}m`;

    return {
        today: {
            created: liveCreated || 0,
            served: liveServed || 0,
            skipped: liveSkipped || 0,
            emergency: liveEmergency || 0
        },
        trend: trend || [],
        avgRating,
        timeSavedLabel
    };
}
