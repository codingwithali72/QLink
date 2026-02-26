"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { queueWhatsAppMessage } from "@/lib/whatsapp";
import { normalizeIndianPhone } from "@/lib/phone";
import { encryptPhone, hashPhone, decryptPhone } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// --- HELPERS ---

async function getAuthenticatedUser() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// DPDP MULTI-TENANT ISOLATION FIX
// Exploit: Auth users could pass any clinicSlug to modify queues they don't own.
// Fix: Strictly verify that the authenticated user belongs to the target business_id
async function verifyClinicAccess(businessId: string): Promise<boolean> {
    const user = await getAuthenticatedUser();
    if (!user) return false;

    // Super Admin bypass
    if (user.email === process.env.ADMIN_EMAIL) return true;

    const supabase = createAdminClient();
    const { data: staff } = await supabase
        .from('staff_users')
        .select('id')
        .eq('id', user.id)
        .eq('business_id', businessId)
        .maybeSingle();

    return !!staff;
}

async function getBusinessBySlug(slug: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('businesses').select('id, name, settings, is_active, deleted_at').eq('slug', slug).single();
    if (error || !data) return null;
    if (data.deleted_at) throw new Error("Clinic not found");
    // Billing bypass protection: suspended clinics cannot perform any queue operations
    if (!data.is_active) throw new Error("Clinic temporarily disabled");
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

        // RBAC: Only staff from this clinic can start its session
        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

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

    const supabase = createAdminClient();
    const user = await getAuthenticatedUser();
    const actualStaffId = user?.id || null;

    // DPDP VAPT Fix: Only authenticated staff can bypass rate limits
    if (!actualStaffId) {
        const ip = headers().get('x-forwarded-for') || headers().get('x-real-ip') || 'unknown-ip';
        const rateLimit = checkRateLimit(ip, 5, 2 * 60 * 1000); // 5 tokens per IP per 2 mins
        if (!rateLimit.success) {
            return { error: "Too many requests. Please wait a moment." };
        }
    }

    // 0. SECURITY INJECTION SHIELD & INPUT SANITIZATION
    // DPDP VAPT Fix: Do not trust client-provided staff IDs. Only authenticated
    // staff sessions (JWT) can set isPriority = true.
    if (!actualStaffId) {
        isPriority = false;
    }

    // Input sanitization: Trim, restrict to 50 chars, and robust PII/XSS mitigation
    const safeName = name
        .trim()
        .substring(0, 50)
        .replace(/<[^>]*>?/gm, '') // Strip all HTML tags
        .replace(/[&"'/<>]/g, (s) => ({
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#47;',
            '<': '&lt;',
            '>': '&gt;'
        }[s] || s)); // Standard HTML entity encoding

    // Allow empty phone for emergency walk-ins. Convert legacy 0000000000 to null.
    const isEmergencyFake = phone === "0000000000" || phone.trim() === "";
    const cleanPhone = isEmergencyFake ? null : normalizeIndianPhone(phone);

    if (!isEmergencyFake && !cleanPhone) {
        return { error: "Valid 10-digit Indian mobile number required" };
    }

    // Public users must provide a phone
    if (!cleanPhone && !isPriority) {
        return { error: "Valid 10-digit Indian mobile number required" };
    }

    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const session = await getActiveSession(business.id);
        if (!session) return { error: "Queue is CLOSED. Ask reception to start session." };

        // --- PUBLIC QR INTAKE CHECK ---
        if (!actualStaffId && business.settings) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const settings = business.settings as any;
            if (settings.qr_intake_enabled === false) {
                return { error: "QR intake is currently disabled for this clinic. Please see the receptionist." };
            }
        }

        // --- RATE LIMITING (Public QR Joiner Block) ---
        if (!actualStaffId) {
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

        // Active-token deduplication and daily limit are enforced INSIDE the
        // create_token_atomic RPC via FOR UPDATE + count + partial unique index.
        // No pre-check here — pre-checks outside the transaction are race-prone
        // and were showing the wrong error ("once per day" instead of redirecting).

        // Encrypt phone for storage (DPDP requirement)
        // - patient_phone_encrypted: AES-256-GCM ciphertext stored
        // - patient_phone_hash: HMAC-SHA256 for deduplication index
        // - p_phone: NULL for new encrypted writes (backward compat field)
        let phoneEncrypted: string | null = null;
        let phoneHash: string | null = null;

        if (cleanPhone) {
            try {
                phoneEncrypted = encryptPhone(cleanPhone);
                phoneHash = hashPhone(cleanPhone);
            } catch (cryptoErr) {
                // If encryption env vars are not set (dev without keys), fall back to plaintext
                // Log the error but do not break token creation
                console.error('[createToken] Encryption key not configured, storing plaintext:', cryptoErr);
            }
        }

        // RPC — pass encrypted form; p_phone is NULL for encrypted path
        const { data, error } = await supabase.rpc('create_token_atomic', {
            p_business_id: business.id,
            p_session_id: session.id,
            p_name: safeName || "Guest",
            p_phone: phoneEncrypted ? null : cleanPhone,  // NULL when encrypted
            p_is_priority: isPriority,
            p_staff_id: actualStaffId,
            p_phone_encrypted: phoneEncrypted,
            p_phone_hash: phoneHash,
        });

        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = data as any;

        // Handle daily token limit reached
        if (result && result.success === false && result.limit_reached) {
            return {
                success: false,
                error: result.error,
                limit_reached: true,
                limit: result.limit,
                count: result.count
            };
        }

        // Handle duplicate active token specifically
        if (result && result.success === false && result.is_duplicate) {
            return {
                success: false,
                error: result.error,
                is_duplicate: true,
                existing_token_id: result.existing_token_id,
                existing_token_number: result.existing_token_number,
                existing_status: result.existing_status
            };
        }

        const token = { id: result.token_id, token_number: result.token_number };

        // Consent logging (DPDP — log every token creation with consent metadata)
        // QR source = patient gave explicit UI consent (checkbox)
        // Receptionist source = implied in-person consent
        const reqHeaders = actualStaffId ? null : headers();
        const ip = reqHeaders?.get("x-forwarded-for") || reqHeaders?.get("x-real-ip") || null;
        const ua = reqHeaders?.get("user-agent") || null;
        const source = actualStaffId ? 'receptionist' : 'qr';

        if (phoneHash || cleanPhone) {
            // Non-blocking compliance log
            supabase.from('patient_consent_logs').insert({
                clinic_id: business.id,
                phone_hash: phoneHash || hashPhone(cleanPhone || 'emergency'),
                consent_text_version: 'v1.0-2026-02-24',
                consent_given: true,
                source,
                ip_address: ip,
                user_agent: ua,
                session_id: session.id,
            }).then(({ error: consentErr }) => {
                if (consentErr) console.error('[createToken] Consent log failed:', consentErr);
            });
        }

        // Audit handled inside create_token_atomic RPC (Section 8 of migration)
        // Redundant logAudit(business.id, ...) removed to save 200ms roundtrip.

        // WhatsApp (Decoupled to Background Queue to avoid blocking DB transactions on High API latency)
        if (cleanPhone) {
            const trackingLink = `${BASE_URL}/${clinicSlug}/t/${token.id}`;
            // Intentionally NO `await` here. Let Vercel/Node finish it asynchronously.
            queueWhatsAppMessage(
                business.id,
                token.id,
                "token_created",
                cleanPhone,
                [
                    { type: "text", text: business.name },
                    { type: "text", text: isPriority ? `E-${token.token_number}` : `#${token.token_number}` },
                    { type: "text", text: trackingLink }
                ]
            ).catch(err => console.error("Async WhatsApp Error:", err));
        }

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

// PATIENT SELF-CANCEL
// Section 5 fix: patient can cancel their own WAITING token without staff auth.
// Security invariants enforced here (no client-side trust):
//   1. Token must be WAITING (not SERVING, SERVED, CANCELLED, SKIPPED)
//   2. Token must belong to the supplied clinicSlug  (cross-clinic prevention)
//   3. Session for that clinic must be ACTIVE (OPEN or PAUSED)
//   4. Phone must match the token's stored hash or plaintext (ownership proof)
//   5. No staff_id required — unauthenticated patient action
export async function patientCancelToken(clinicSlug: string, tokenId: string, phone: string) {
    if (!clinicSlug || !tokenId || !phone) return { error: "Missing required fields" };

    const cleanPhone = normalizeIndianPhone(phone);
    if (!cleanPhone) return { error: "Valid 10-digit Indian mobile number required" };

    try {
        const supabase = createAdminClient();

        // 1. Resolve clinic — reuse getBusinessBySlug which also checks is_active / deleted_at
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        // 2. Fetch the token — join through session to enforce clinic ownership at DB level
        const { data: token } = await supabase
            .from('tokens')
            .select('id, status, patient_phone, patient_phone_hash, session_id, business_id')
            .eq('id', tokenId)
            .eq('business_id', business.id)   // cross-clinic guard
            .maybeSingle();

        if (!token) return { error: "Token not found" };

        // 3. Verify session is still active (prevents cancellations on closed sessions)
        const { data: session } = await supabase
            .from('sessions')
            .select('status')
            .eq('id', token.session_id)
            .maybeSingle();

        if (!session || !['OPEN', 'PAUSED'].includes(session.status)) {
            return { error: "Session is no longer active" };
        }

        // 4. Token must be in WAITING state (not already served/cancelled/serving)
        if (token.status !== 'WAITING') {
            return { error: `Cannot cancel a token with status: ${token.status}` };
        }

        // 5. Phone ownership check — try hash first (DPDP encrypted path), then plaintext (legacy)
        let phoneMatches = false;
        if (token.patient_phone_hash) {
            const { hashPhone } = await import('@/lib/crypto');
            phoneMatches = hashPhone(cleanPhone) === token.patient_phone_hash;
        } else if (token.patient_phone) {
            phoneMatches = token.patient_phone === cleanPhone;
        }

        if (!phoneMatches) {
            return { error: "Phone number does not match this token" };
        }

        // 6. Perform the cancellation
        const { error: cancelError } = await supabase
            .from('tokens')
            .update({ status: 'CANCELLED', previous_status: token.status, cancelled_at: new Date().toISOString() })
            .eq('id', tokenId)
            .eq('status', 'WAITING'); // double-guard: prevents race condition

        if (cancelError) throw cancelError;

        // 7. Audit log (staff_id null = patient action)
        await logAudit(business.id, 'PATIENT_SELF_CANCEL', { token_id: tokenId, phone_last4: cleanPhone.slice(-4) });

        return { success: true };
    } catch (e) {
        console.error("Patient Cancel Error:", e);
        return { error: (e as Error).message };
    }
}



// B4 FIX: Edit token patient name / phone after creation
export async function updateToken(clinicSlug: string, tokenId: string, name: string, phone: string) {
    if (!tokenId || !clinicSlug) return { error: "Missing data" };

    // Only strictly validate if phone is provided as this form might just be updating name
    const cleanPhone = phone ? normalizeIndianPhone(phone) : null;
    if (phone && !cleanPhone) return { error: "Valid 10-digit Indian mobile number required" };

    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

        const { error } = await supabase
            .from('tokens')
            .update({ patient_name: name || null, patient_phone: cleanPhone || null })
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

// SECURE MANUAL CALL
export async function triggerManualCall(clinicSlug: string, tokenId: string) {
    if (!tokenId || !clinicSlug) return { error: "Missing data" };

    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized: Staff login required to access phone numbers." };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

        const { data: token } = await supabase
            .from('tokens')
            .select('id, patient_phone, token_number')
            .eq('id', tokenId)
            .eq('business_id', business.id)
            .single();

        if (!token) return { error: "Token not found" };
        if (!token.patient_phone) return { error: "No phone number available for this patient" };

        // Log the secure access event
        await logAudit(business.id, 'manual_call', {
            token_id: tokenId,
            token_number: token.token_number
        });

        return { success: true, phone: token.patient_phone };

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



// 8. PUBLIC TRACKING (Replaces Realtime)
export async function getPublicTokenStatus(tokenId: string) {
    if (!tokenId) return { error: "Invalid token ID" };
    try {
        const supabase = createAdminClient();

        // Fetch the token with its session
        // DPDP: explicitly list only non-PII columns — patient_phone and patient_name
        // are NOT included here. The public tracking page never needs them.
        const { data: token, error: tokenError } = await supabase
            .from('tokens')
            .select(`
                id, token_number, status, is_priority,
                created_at, served_at, cancelled_at,
                session_id, business_id, rating,
                sessions!inner( status, date, business_id )
            `)
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
                    // patient_name intentionally excluded — public page shows no PII
                    status: token.status,
                    is_priority: token.is_priority,
                    created_at: token.created_at,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    session_status: (token as any).sessions?.status || 'CLOSED',
                    rating: token.rating,
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

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

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

        if (!await verifyClinicAccess(business.id)) throw new Error("Unauthorized: You do not have access to this clinic.");

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


// 8.5 Toggle Arrival Status
export async function toggleArrivalStatus(clinicSlug: string, tokenId: string, isArrived: boolean) {
    if (!tokenId || !clinicSlug) return { error: "Missing data" };
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

        const { error } = await supabase
            .from('tokens')
            .update({
                is_arrived: isArrived,
                arrived_at: isArrived ? new Date().toISOString() : null,
                grace_expires_at: null, // Clear any grace periods
                status: isArrived ? 'WAITING' : 'WAITING' // Always normal wait status on manual toggle
            })
            .eq('id', tokenId)
            .eq('business_id', business.id)

        if (error) throw error;
        await logAudit(business.id, 'ARRIVAL_TOGGLED', { token_id: tokenId, is_arrived: isArrived });
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function getDashboardData(clinicSlug: string) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: "Unauthorized" };

        const today = getClinicDate();

        // Get limits from business config
        const { data: businessData } = await supabase
            .from('businesses')
            .select('daily_token_limit')
            .eq('id', business.id)
            .single();

        // Get active session
        const { data: session } = await supabase
            .from('sessions')
            .select('*')
            .eq('business_id', business.id)
            .eq('date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) return { session: null, tokens: [], dailyTokenLimit: businessData?.daily_token_limit || null, businessId: business.id };

        // Get tokens
        const { data: tokens } = await supabase
            .from('tokens')
            .select('*')
            .in('status', ['WAITING', 'SERVING', 'SKIPPED', 'CANCELLED', 'SERVED', 'WAITING_LATE'])
            .eq('session_id', session.id)
            .order('token_number', { ascending: true });

        const safeTokens = (tokens || []).map(t => {
            let decryptedPhone = t.patient_phone;
            if (t.patient_phone_encrypted) {
                try {
                    decryptedPhone = decryptPhone(t.patient_phone_encrypted);
                } catch (e) {
                    console.error('[getDashboardData] Decryption failed:', e);
                    decryptedPhone = "[decryption_error]";
                }
            }
            return {
                ...t,
                patient_phone: decryptedPhone,
                customerPhone: decryptedPhone, // Secondary mapping for UI components
                customerName: t.patient_name,     // Mapping for consistency
                isArrived: t.is_arrived,
                graceExpiresAt: t.grace_expires_at,
                source: t.source,
            };
        });

        return { session, tokens: safeTokens, dailyTokenLimit: businessData?.daily_token_limit || null, businessId: business.id };
    } catch (e) {
        console.error("Dashboard Data Fetch Error:", e);
        return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: (e as Error).message };
    }
}

// 9. HISTORY
export async function getTokensForDate(clinicSlug: string, date: string, limit: number = 50, offset: number = 0) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized: You do not have access to this clinic." };

        const { data: session } = await supabase
            .from('sessions')
            .select('id')
            .eq('business_id', business.id)
            .eq('date', date)
            .maybeSingle();

        if (!session) return { tokens: [], hasMore: false };

        const { data, count } = await supabase
            .from('tokens')
            .select('id, token_number, patient_name, patient_phone, patient_phone_encrypted, status, is_priority, rating, feedback, created_at, served_at, cancelled_at, created_by_staff_id', { count: 'exact' })
            .eq('session_id', session.id)
            .order('token_number', { ascending: true })
            .range(offset, offset + limit - 1);

        const hasMore = count ? offset + (data?.length || 0) < count : false;

        // Map to camelCase for consistent use in the UI
        const tokens = (data || []).map((t: any) => { // eslint-disable-line
            let decryptedPhone = t.patient_phone;
            if (t.patient_phone_encrypted) {
                try {
                    decryptedPhone = decryptPhone(t.patient_phone_encrypted);
                } catch (e) {
                    console.error('[getTokensForDate] Decryption failed:', e);
                    decryptedPhone = "[decryption_error]";
                }
            }
            return {
                id: t.id,
                tokenNumber: t.token_number,
                customerName: t.patient_name,
                customerPhone: decryptedPhone,
                status: t.status,
                isPriority: t.is_priority,
                rating: t.rating,
                feedback: t.feedback,
                createdAt: t.created_at,
                servedAt: t.served_at,
            };
        });

        return { tokens, hasMore };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
