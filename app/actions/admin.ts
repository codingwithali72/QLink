"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// VAPT FIX: DB-based RBAC with env-var bootstrap fallback
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Ensure strictly authorized context
export async function isSuperAdmin() {
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return false;

    // 1. Bootstrap fallback: env-var email match (Priority for bypass)
    if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) return true;

    try {
        // 2. check: DB-level SUPER_ADMIN role
        const admin = createAdminClient();
        const { data: staffRow } = await admin.from('staff_users')
            .select('role')
            .eq('id', user.id)
            .eq('role', 'SUPER_ADMIN')
            .maybeSingle();
        if (staffRow) return true;
    } catch (e) {
        console.error('[isSuperAdmin] Admin check error:', e);
    }

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

export async function createBusiness(name: string, slug: string, phone: string, email?: string, password?: string, existingUserId?: string, operationMode: 'OPD' | 'HOSPITAL' | 'CLINIC' = 'OPD') {
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
            operation_mode: operationMode,
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

    const client = createClient();
    const { data: { user } } = await client.auth.getUser();

    // VAPT FIX: Atomic force-close via CLINICAL version of RPC
    const { data, error } = await supabase.rpc('rpc_force_close_session_clinical', {
        p_business_id: businessId,
        p_staff_id: user?.id || null,
    });

    if (error) return { error: error.message };

    const result = data as { success?: boolean; error?: string; cancelled_tokens?: number };
    if (result && result.success === false) return { error: result.error || 'Force close failed' };

    await logAdminAction('RESET_SESSION', 'SESSION', businessId, undefined, {
        cancelled_visits: result?.cancelled_tokens || 0,
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

    // 1. Fetch businesses for the list view
    const { data: businesses } = await supabase.from('businesses')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    // 2. We still need tokens_today mapped per business for the list view
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: sessionData } = await supabase.from('sessions').select('business_id, id').eq('date', todayStr);
    const sessionIds = (sessionData || []).map(s => s.id);

    const { data: visitCounts } = await supabase
        .from('clinical_visits')
        .select('clinic_id, id')
        .in('session_id', sessionIds);

    const countMap = (visitCounts || []).reduce((acc: Record<string, number>, v) => {
        acc[v.clinic_id] = (acc[v.clinic_id] || 0) + 1;
        return acc;
    }, {});

    const businessesWithStats = (businesses || []).map(b => ({
        ...b,
        tokens_today: countMap[b.id] || 0
    }));

    // 3. Delegate executive stats to DB RPC for mathematical and topological integrity
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();

    let execStats = {
        activeSessions: 0,
        todayTokens: 0,
        messagesToday: 0,
        activeQueueTokens: 0,
        avgWaitMins: 0,
    };

    if (user) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_admin_executive_overview', {
            p_admin_id: user.id
        });

        if (!rpcErr && rpcData) {
            execStats = {
                activeSessions: rpcData.active_sessions || 0,
                todayTokens: rpcData.today_tokens || 0,
                messagesToday: rpcData.messages_today || 0,
                activeQueueTokens: rpcData.today_tokens || 0, // Roughly maps for now until distinct active queue RPC implemented
                avgWaitMins: rpcData.avg_wait_time_live_mins || 0,
            };
        }

        // Add direct pull for WhatsApp Delivery Fails (Phase 13 Utility Dispatch)
        const istStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();
        const { count: failedMsgs } = await supabase.from('whatsapp_logs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'failed')
            .gte('created_at', istStart);

        execStats.messagesToday = execStats.messagesToday || 0; // The RPC tracks `whatsapp_messages` (inbound), this adds context.
        Object.assign(execStats, { messagesFailedToday: failedMsgs || 0 });

        // Phase 5 Billing: Active Subscriptions total
        const { count: activeSubs } = await supabase.from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ACTIVE');

        Object.assign(execStats, { activeSubscriptions: activeSubs || 0 });
    }

    return {
        businesses: businessesWithStats,
        ...execStats
    };
}

// ─── BI COMMAND CENTER FUNCTIONS (Phase 4 & 5) ──────────────────────────────

/**
 * Sibtain.md L33: "Provider productivity metrics via comparative horizontal bar charts"
 */
export async function getDoctorProductivityBI(clinicId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    let query = supabase.from('v_doctor_productivity').select('*');
    if (clinicId) query = query.eq('clinic_id', clinicId);

    const { data, error } = await query.order('avg_consultation_mins', { ascending: false });
    if (error) return { error: error.message };
    return { data: data || [] };
}

/**
 * Sibtain.md L32: "Time-series line graphs ... allowing administrators to predict peak OPD hours"
 */
export async function getHourlyFootfallBI(clinicId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    let query = supabase.from('v_hourly_footfall').select('*');
    if (clinicId) query = query.eq('clinic_id', clinicId);

    // Last 7 days heatmap
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    query = query.gte('visit_date', sevenDaysAgo);

    const { data, error } = await query.order('visit_date', { ascending: false }).order('hour_of_day', { ascending: true });
    if (error) return { error: error.message };
    return { data: data || [] };
}

/**
 * Sibtain.md WhatsApp Engine: "Template cost tracker, Retry rate monitor"
 */
export async function getWhatsAppAnalyticsBI(clinicId?: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();
    let query = supabase.from('v_whatsapp_analytics').select('*');
    if (clinicId) query = query.eq('clinic_id', clinicId);

    const { data, error } = await query.order('log_date', { ascending: false });
    if (error) return { error: error.message };
    return { data: data || [] };
}

/**
 * Phase 5 Billing: Get billing/usage compliance status for a clinic
 */
export async function getClinicBillingStatus(clinicId: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    const { data: sub } = await supabase.from('subscriptions')
        .select(`
            *,
            plans (*)
        `)
        .eq('clinic_id', clinicId)
        .maybeSingle();

    const { data: usage } = await supabase.from('usage_metrics')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();

    return { subscription: sub, usage_today: usage };
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

    const totalCreated = rows.reduce((acc, row) => acc + (row.total_tokens || 0), 0);
    const totalServed = rows.reduce((acc, row) => acc + (row.served_count || 0), 0);
    // FIX: read from DB column — was hardcoded to 0
    const totalCancelled = rows.reduce((acc, row) => acc + (row.cancelled_count || 0), 0);
    const totalSkipped = rows.reduce((acc, row) => acc + (row.skipped_count || 0), 0);

    // FIX: Weighted average wait time (weight by served_count per day)
    // Simple mean-of-means is wrong when days have unequal volumes.
    // e.g. Day1: 100 served, 5 min avg — Day2: 2 served, 60 min avg → weighted avg ≈ 6 min (correct), simple avg = 32 min (wrong)
    const weightedWaitTotal = rows.reduce((acc, row) => {
        const served = row.served_count || 0;
        const avg = Number(row.avg_wait_time_minutes) || 0;
        return acc + (served * avg);
    }, 0);
    const avgWaitMins = totalServed > 0
        ? Math.round(weightedWaitTotal / totalServed)
        : null;

    // FIX: Time saved = total served × measured avg wait (not fake 20-min constant).
    // If no avg wait data, fall back to null to avoid fake numbers.
    const timeSavedMins = (avgWaitMins !== null && totalServed > 0)
        ? totalServed * avgWaitMins
        : null;
    const timeSavedHours = timeSavedMins !== null ? Math.floor(timeSavedMins / 60) : null;

    const ratedDays = rows.filter(r => (r.avg_rating || 0) > 0);
    const avgRating = ratedDays.length > 0
        ? Number((ratedDays.reduce((acc, row) => acc + (row.avg_rating || 0), 0) / ratedDays.length).toFixed(1))
        : null;

    return {
        totalCreated,
        totalServed,
        totalCancelled,
        totalSkipped,
        avgRating,
        avgWaitMins,
        timeSavedMins,
        timeSavedLabel: timeSavedMins === null
            ? '—'
            : timeSavedHours !== null && timeSavedHours > 0
                ? `${timeSavedHours}h ${timeSavedMins % 60}m`
                : `${timeSavedMins}m`,
    };
}

export async function getClinicMetrics(businessId: string) {
    if (!await isSuperAdmin()) return { error: "Unauthorized" };
    const supabase = createAdminClient();

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istStart = new Date(`${todayStr}T00:00:00+05:30`).toISOString();

    const client = createClient();
    const { data: { user } } = await client.auth.getUser();

    // 1. Fetch deep analytics via exact DB RPC if super admin
    let analyticsData = {
        total_created: 0,
        total_served: 0,
        total_cancelled: 0,
        total_skipped: 0,
        avg_wait_mins: 0,
        avg_service_mins: 0,
        avg_rating: 0,
        drop_off_rate_pct: 0
    };

    if (user) {
        // Today's boundaries
        const todayStrDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_clinic_deep_analytics', {
            p_admin_id: user.id,
            p_clinic_id: businessId,
            p_start_date: todayStrDate,
            p_end_date: todayStrDate
        });

        if (!rpcErr && rpcData) {
            analyticsData = rpcData;
        }
    }

    // Live Today Stats for specifics not in RPC (emergency) via clinical_visits
    const { count: liveEmergency } = await supabase.from('clinical_visits').select('id', { count: 'exact', head: true }).eq('clinic_id', businessId).eq('is_priority', true).gte('created_at', istStart);

    // Historical trend via clinic_daily_stats (bridged in Phase 15)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: trend } = await supabase.from('clinic_daily_stats')
        .select('date, total_tokens, avg_wait_time_minutes, served_count')
        .eq('business_id', businessId)
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: true });

    return {
        today: {
            created: analyticsData.total_created || 0,
            served: analyticsData.total_served || 0,
            skipped: analyticsData.total_skipped || 0,
            emergency: liveEmergency || 0
        },
        trend: trend || [],
        avgRating: analyticsData.avg_rating ? String(analyticsData.avg_rating) : null,
        timeSavedLabel: `${(analyticsData.total_served || 0) * (analyticsData.avg_wait_mins || 20)}m (today)`
    };
}
