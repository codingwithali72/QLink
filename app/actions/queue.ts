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

export async function getBusinessId(slug: string) {
    const business = await getBusinessBySlug(slug);
    return business?.id || null;
}

import { getClinicDate } from "@/lib/date";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveSession(businessId: string) {
    const supabase = createAdminClient();
    const today = getClinicDate();
    console.log('[getActiveSession] businessId:', businessId, 'today:', today);

    const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('business_id', businessId)
        .eq('date', today)
        .in('status', ['OPEN', 'PAUSED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('[getActiveSession] Supabase error:', JSON.stringify(error));
    }
    if (!data) {
        // Debug: check what sessions actually exist for today
        const { data: allSessions } = await supabase
            .from('sessions')
            .select('id, status, date, business_id')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(5);
        console.error('[getActiveSession] No OPEN/PAUSED session found. All recent sessions:', JSON.stringify(allSessions));
    }
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
    const supabase = createAdminClient();
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const today = getClinicDate();

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

        const session = await getActiveSession(business.id);
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

// SUBMIT FEEDBACK
export async function submitFeedback(tokenId: string, rating: number, feedbackText: string = "") {
    if (!tokenId || !rating) return { error: "Missing data" };
    try {
        const supabase = createAdminClient();
        const { error } = await supabase
            .from('tokens')
            .update({ rating, feedback: feedbackText || null })
            .eq('id', tokenId);
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error("Feedback Error:", e);
        return { error: (e as Error).message };
    }
}

// B4 FIX: Edit token patient name / phone after creation
export async function updateToken(clinicSlug: string, tokenId: string, name: string, phone: string) {
    if (!tokenId || !clinicSlug) return { error: "Missing data" };
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        const { error } = await supabase
            .from('tokens')
            .update({ patient_name: name || null, patient_phone: phone || null })
            .eq('id', tokenId)
            .eq('business_id', business.id) // C3 safety: verify ownership
            .in('status', ['WAITING', 'SERVING']); // only editable while active

        if (error) throw error;
        await logAudit(business.id, 'TOKEN_EDITED', { token_id: tokenId });
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

// 3. NEXT
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function nextPatient(clinicSlug: string, tokenId?: string) {
    return processQueueAction(clinicSlug, 'NEXT', tokenId);
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

        // Fetch the token with its session
        const { data: token, error: tokenError } = await supabase
            .from('tokens')
            .select('*, sessions!inner(status, date, business_id)')
            .eq('id', tokenId)
            .maybeSingle();

        if (tokenError) throw tokenError;
        if (!token) return { error: "Token not found" };

        // SF1 FIX: Compute tokens_ahead using SORT POSITION, not token_number comparison
        // This correctly handles priority tokens with high token numbers
        let tokensAhead = 0;
        if (token.status === 'WAITING') {
            const { data: waitingQueue } = await supabase
                .from('tokens')
                .select('id')
                .eq('session_id', token.session_id)
                .eq('status', 'WAITING')
                .order('is_priority', { ascending: false })
                .order('token_number', { ascending: true });

            // Find this token's position in the sorted queue
            const position = (waitingQueue || []).findIndex(t => t.id === token.id);
            tokensAhead = position > 0 ? position : 0;
        }

        // Get currently serving token
        const { data: servingToken } = await supabase
            .from('tokens')
            .select('token_number, is_priority')
            .eq('session_id', token.session_id)
            .eq('status', 'SERVING')
            .maybeSingle();

        const currentServing = servingToken
            ? (servingToken.is_priority ? `E-${servingToken.token_number}` : `#${servingToken.token_number}`)
            : "--";

        return {
            success: true,
            data: {
                token: {
                    id: token.id,
                    token_number: token.token_number,
                    patient_name: token.patient_name,
                    status: token.status,
                    is_priority: token.is_priority,
                    created_at: token.created_at,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    session_status: (token as any).sessions?.status || 'CLOSED',
                },
                tokens_ahead: tokensAhead,
                current_serving: currentServing,
            }
        };
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

// C1 + C3 FIX: Use atomic Postgres RPC with FOR UPDATE row lock
// The SQL function serializes concurrent actions and verifies business_id ownership
async function processQueueAction(slug: string, action: string, tokenId?: string) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(slug);
        if (!business) return { error: "Business not found" };

        // C3 FIX: Require authenticated staff for all queue mutations
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized: staff login required" };

        // For RESUME_SESSION, look for a PAUSED session too
        let session = await getActiveSession(business.id);
        if (!session && action === 'RESUME_SESSION') {
            const today = getClinicDate();
            const { data: paused } = await supabase
                .from('sessions').select('*')
                .eq('business_id', business.id).eq('date', today).eq('status', 'PAUSED').maybeSingle();
            session = paused;
        }
        if (!session) return { error: "No active session" };

        // C1 FIX: Single atomic RPC call — uses SELECT FOR UPDATE inside Postgres
        const { data, error } = await supabase.rpc('rpc_process_queue_action', {
            p_business_id: business.id,
            p_session_id: session.id,
            p_staff_id: user.id,
            p_action: action,
            p_token_id: tokenId || null,
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;
        if (result && result.success === false) return { error: result.error || 'Action failed' };

        revalidatePath(`/${slug}`);
        return { success: true };
    } catch (e) {
        console.error(`[processQueueAction] ${action} error:`, e);
        return { error: (e as Error).message };
    }
}

async function updateSessionStatus(slug: string, status: 'OPEN' | 'CLOSED' | 'PAUSED') {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(slug);
        if (!business) throw new Error("Business not found");

        const today = getClinicDate();
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


export async function getDashboardData(businessId: string) {
    const supabase = createAdminClient();
    try {
        const today = getClinicDate();

        // Get active session
        const { data: session } = await supabase
            .from('sessions')
            .select('*')
            .eq('business_id', businessId)
            .eq('date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) return { session: null, tokens: [] };

        // Get tokens
        const { data: tokens } = await supabase
            .from('tokens')
            .select('*')
            .eq('session_id', session.id)
            .order('token_number', { ascending: true });

        return { session, tokens: tokens || [] };
    } catch (e) {
        console.error("Dashboard Data Fetch Error:", e);
        return { session: null, tokens: [] };
    }
}

// 9. HISTORY
export async function getTokensForDate(clinicSlug: string, date: string) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        const { data: session } = await supabase
            .from('sessions')
            .select('id')
            .eq('business_id', business.id)
            .eq('date', date)
            .maybeSingle();

        if (!session) return { tokens: [] };

        const { data } = await supabase
            .from('tokens')
            .select('id, token_number, patient_name, patient_phone, status, is_priority, rating, feedback, created_at, served_at, cancelled_at, created_by_staff_id')
            .eq('session_id', session.id)
            .order('token_number', { ascending: true });

        // Map to camelCase for consistent use in the UI
        const tokens = (data || []).map((t: any) => ({ // eslint-disable-line
            id: t.id,
            tokenNumber: t.token_number,
            customerName: t.patient_name,
            customerPhone: t.patient_phone,
            status: t.status,
            isPriority: t.is_priority,
            rating: t.rating,
            feedback: t.feedback,
            createdAt: t.created_at,
            servedAt: t.served_at,
        }));

        return { tokens };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
