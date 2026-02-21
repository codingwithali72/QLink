"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { queueWhatsAppMessage } from "@/lib/whatsapp";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// --- HELPERS ---

async function getAuthenticatedUser() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

async function getBusinessBySlug(slug: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('businesses').select('id, name, settings').eq('slug', slug).single();
    if (error || !data) return null;
    return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveSession(supabase: any, businessId: string) {
    const { data } = await supabase.from('sessions').select('*').eq('business_id', businessId).eq('status', 'OPEN').single();
    return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAudit(businessId: string, action: string, details: any = {}) {
    try {
        const user = await getAuthenticatedUser();
        // If no user (e.g. public QR join), we log staff_id as null
        const supabase = createAdminClient();
        await supabase.from('audit_logs').insert({
            business_id: businessId,
            staff_id: user?.id || null,
            action,
            details
        });
    } catch (e) {
        console.error("Audit Log Error:", e);
    }
}

// --- ACTIONS ---

// 1. START SESSION (New)
export async function startSession(clinicSlug: string) {
    const supabase = createClient();
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const today = new Date().toISOString().split('T')[0];

        // Check if session exists
        const { data: existing } = await supabase.from('sessions').select('id').eq('business_id', business.id).eq('date', today).single();

        if (existing) {
            // Re-open if closed
            await supabase.from('sessions').update({ status: 'OPEN' }).eq('id', existing.id);
        } else {
            // Create new
            const { error } = await supabase.from('sessions').insert({
                business_id: business.id,
                date: today,
                status: 'OPEN'
            });
            if (error) throw error;
        }

        await logAudit(business.id, 'START_SESSION');
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

// 2. CREATE TOKEN
export async function createToken(clinicSlug: string, phone: string, name: string = "", isPriority: boolean = false) {
    if (!clinicSlug) return { error: "Missing clinic slug" };
    if (!phone || phone.length < 10) return { error: "Valid phone number required" };

    const supabase = createAdminClient();
    const user = await getAuthenticatedUser();

    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const session = await getActiveSession(supabase, business.id);
        if (!session) return { error: "Queue is CLOSED. Ask reception to start session." };

        const createdByStaffId = user?.id || null;

        // --- RATE LIMITING (Public QR Joiner Block) ---
        if (!createdByStaffId) {
            const reqHeaders = headers();
            const ip = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || "unknown_ip";

            const { data: allowed, error: rlError } = await supabase.rpc('rpc_check_rate_limit', {
                p_ip: ip,
                p_endpoint: 'create_token_qr',
                p_max_hits: 3, // Max 3 tokens from same IP
                p_window_seconds: 600 // per 10 minutes
            });

            if (rlError && !rlError.message.includes('function')) {
                console.error("Rate Limit Verification Error:", rlError);
            } else if (allowed === false) {
                return { error: "You are requesting tokens too fast. Please wait 10 minutes or see the reception counter." };
            }
        }

        // RPC
        const { data, error } = await supabase.rpc('create_token_atomic', {
            p_business_id: business.id,
            p_session_id: session.id,
            p_name: name || "Guest",
            p_phone: phone,
            p_is_priority: isPriority,
            p_staff_id: createdByStaffId
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;
        const token = { id: result.token_id, token_number: result.token_number };

        // Audit
        // If created by staff, log 'ADD_TOKEN'. If public, log 'JOIN_QR'.
        await logAudit(business.id, createdByStaffId ? 'ADD_TOKEN' : 'JOIN_QR', { token_no: token.token_number, priority: isPriority });

        // WhatsApp (Decoupled to Background Queue)
        const trackingLink = `${BASE_URL}/${clinicSlug}/t/${token.id}`;
        await queueWhatsAppMessage(
            business.id,
            token.id,
            "token_created",
            phone,
            [
                { type: "text", text: business.name },
                { type: "text", text: isPriority ? `E-${token.token_number}` : `#${token.token_number}` },
                { type: "text", text: trackingLink }
            ]
        );

        revalidatePath(`/${clinicSlug}`);
        return { success: true, token };

    } catch (e) {
        console.error("Create Token Error:", e);
        return { error: (e as Error).message };
    }
}

// 3. NEXT
export async function nextPatient(clinicSlug: string, tokenId?: string, roomNumber?: string) {
    const supabase = createClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const session = await getActiveSession(supabase, business.id);
        if (!session) return { error: "No active session" };

        const user = await getAuthenticatedUser();
        const { data, error } = await supabase.rpc('rpc_process_queue_action', {
            p_business_id: business.id,
            p_session_id: session.id,
            p_staff_id: user?.id,
            p_action: 'NEXT',
            p_token_id: tokenId || null,
            p_room_number: roomNumber || null
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;
        if (!result.success) return { error: result.error || result.message };

        await logAudit(business.id, 'NEXT', { result });

        revalidatePath(`/${clinicSlug}`);
        return { success: true, data: result };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

// 4. SKIP
export async function skipToken(clinicSlug: string, tokenId: string) {
    return processQueueAction(clinicSlug, 'SKIP', tokenId);
}

// 5. RECALL
export async function recallToken(clinicSlug: string, tokenId: string) {
    return processQueueAction(clinicSlug, 'RECALL', tokenId);
}

// 6. CANCEL
export async function cancelToken(clinicSlug: string, tokenId: string) {
    return processQueueAction(clinicSlug, 'CANCEL', tokenId);
}

// 7. UNDO (New)
export async function undoLastAction(clinicSlug: string) {
    return processQueueAction(clinicSlug, 'UNDO');
}

// 8. PUBLIC TRACKING (Replaces Realtime)
export async function getPublicTokenStatus(tokenId: string) {
    if (!tokenId) return { error: "Invalid token ID" };
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc('rpc_get_public_token_status', {
            p_token_id: tokenId
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;
        if (!result.success) return { error: result.error };

        return { success: true, data: result };
    } catch (e) {
        console.error("Public Token Error:", e);
        return { error: (e as Error).message };
    }
}

// 9. SESSION CONTROLS
export async function pauseQueue(clinicSlug: string) {
    return processQueueAction(clinicSlug, 'PAUSE_SESSION');
}
export async function resumeQueue(clinicSlug: string) {
    return processQueueAction(clinicSlug, 'RESUME_SESSION');
}
export async function closeQueue(clinicSlug: string) {
    return updateSessionStatus(clinicSlug, 'CLOSED');
}

// Helper for RPC queue actions
async function processQueueAction(slug: string, action: string, tokenId?: string) {
    const supabase = createClient();
    try {
        const business = await getBusinessBySlug(slug);
        if (!business) return { error: "Business not found" };

        const session = await getActiveSession(supabase, business.id);
        if (!session && action !== 'RESUME_SESSION') return { error: "No active session" };

        const user = await getAuthenticatedUser();
        const { data, error } = await supabase.rpc('rpc_process_queue_action', {
            p_business_id: business.id,
            p_session_id: session?.id || null,
            p_staff_id: user?.id,
            p_action: action,
            p_token_id: tokenId || null
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;
        if (!result.success) return { error: result.error || result.message };

        await logAudit(business.id, action, { token_id: tokenId, result });
        revalidatePath(`/${slug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

async function updateSessionStatus(slug: string, status: 'OPEN' | 'CLOSED' | 'PAUSED') {
    const supabase = createClient();
    try {
        const business = await getBusinessBySlug(slug);
        if (!business) throw new Error("Business not found");

        const today = new Date().toISOString().split('T')[0];
        const { error } = await supabase.from('sessions')
            .update({ status })
            .eq('business_id', business.id)
            .eq('date', today);

        if (error) throw error;

        await logAudit(business.id, status === 'PAUSED' ? 'PAUSE' : status === 'OPEN' ? 'RESUME' : 'CLOSE');
        revalidatePath(`/${slug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}


// 9. HISTORY
export async function getTokensForDate(clinicSlug: string, date: string) {
    const supabase = createClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        const { data: session } = await supabase
            .from('sessions')
            .select('id')
            .eq('business_id', business.id)
            .eq('date', date)
            .single();

        if (!session) return { tokens: [] };

        const { data } = await supabase
            .from('tokens')
            .select('*')
            .eq('session_id', session.id)
            .order('token_number', { ascending: true });

        return { tokens: data || [] };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
