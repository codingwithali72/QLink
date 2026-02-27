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
        const { data: existing } = await supabase.from('sessions').select('id').eq('business_id', business.id).eq('date', today).maybeSingle();

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

        // Use the new standard security audit log
        await supabase.from('security_audit_logs').insert({
            clinic_id: business.id,
            actor_id: user.id,
            action_type: 'SESSION_START',
            table_name: 'sessions'
        });

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

// 2. CREATE CLINICAL VISIT (NABH & DPDP COMPLIANT)
export type TokenResponse =
    | { success: true; token: { id: string; token_number: number } }
    | { success: false; error: string; is_duplicate?: boolean; limit_reached?: boolean; existing_token_id?: string };

export async function createToken(
    clinicSlug: string,
    phone: string,
    name: string = "",
    isPriority: boolean = false,
    visitType: string = 'OPD'
): Promise<TokenResponse> {
    if (!clinicSlug) return { success: false, error: "Missing clinic slug" };

    const supabase = createAdminClient();
    const user = await getAuthenticatedUser();
    const actualStaffId = user?.id || null;

    // Rate Limiting for Public Intake
    if (!actualStaffId) {
        const ip = headers().get('x-forwarded-for') || headers().get('x-real-ip') || 'unknown-ip';
        const rateLimit = checkRateLimit(ip, 5, 2 * 60 * 1000);
        if (!rateLimit.success) return { success: false, error: "Too many requests. Please wait a moment." };
    }

    if (!actualStaffId) isPriority = false;

    const safeName = name.trim().substring(0, 50).replace(/<[^>]*>?/gm, '');
    const cleanPhone = normalizeIndianPhone(phone);

    if (!cleanPhone && !isPriority) return { success: false, error: "Valid 10-digit Indian mobile number required" };

    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { success: false, error: "Clinic not found" };

        const session = await getActiveSession(business.id);
        if (!session) return { success: false, error: "Queue is CLOSED." };

        // Encryption path (DPDP)
        let phoneEncrypted: string | null = null;
        let phoneHash: string | null = null;
        if (cleanPhone) {
            try {
                phoneEncrypted = encryptPhone(cleanPhone);
                phoneHash = hashPhone(cleanPhone);
            } catch (e) {
                console.error('[createToken] Encryption fallback:', e);
            }
        }

        // CALL CLINICAL RPC (Phase 12)
        const { data, error } = await supabase.rpc('rpc_create_clinical_visit', {
            p_clinic_id: business.id,
            p_session_id: session.id,
            p_patient_name: safeName || "Guest",
            p_patient_phone: phoneEncrypted ? null : cleanPhone,
            p_phone_encrypted: phoneEncrypted,
            p_phone_hash: phoneHash,
            p_visit_type: visitType,
            p_is_priority: isPriority,
            p_staff_id: actualStaffId,
            p_source: actualStaffId ? 'RECEPTIONIST' : 'QR'
        });

        if (error) throw error;
        const result = data as {
            success: boolean;
            visit_id?: string;
            token_number?: number;
            error?: string;
            is_duplicate?: boolean;
            limit_reached?: boolean
        };

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Failed to create token',
                is_duplicate: result.is_duplicate,
                limit_reached: result.limit_reached,
                existing_token_id: result.visit_id
            };
        }

        const visit = { id: result.visit_id!, token_number: result.token_number! };

        // Async WhatsApp Alert
        if (cleanPhone && typeof cleanPhone === 'string' && visit.id) {
            const trackingLink = `${BASE_URL}/${clinicSlug}/t/${visit.id}`;
            queueWhatsAppMessage(
                business.id,
                visit.id,
                "token_created",
                cleanPhone,
                [
                    { type: "text", text: business.name },
                    { type: "text", text: isPriority ? `E-${visit.token_number}` : `#${visit.token_number}` },
                    { type: "text", text: trackingLink }
                ]
            ).catch(err => console.error("Async WhatsApp Error:", err));
        }

        revalidatePath(`/${clinicSlug}`);
        return { success: true, token: visit };
    } catch (e) {
        console.error("Clinical Intake Error:", e);
        return { success: false, error: (e as Error).message };
    }
}

// SUBMIT FEEDBACK
export async function submitFeedback(visitId: string, rating: number, feedbackText: string = "") {
    if (!visitId || !rating) return { error: "Missing data" };
    try {
        const supabase = createAdminClient();
        const { error } = await supabase
            .from('clinical_visits')
            .update({ rating: rating as never, feedback: feedbackText || null } as never)
            .eq('id', visitId);
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error("Feedback Error:", e);
        return { error: (e as Error).message };
    }
}

// PATIENT SELF-CANCEL
export async function patientCancelToken(clinicSlug: string, visitId: string, phone: string) {
    if (!clinicSlug || !visitId || !phone) return { error: "Missing required fields" };

    const cleanPhone = normalizeIndianPhone(phone);
    if (!cleanPhone) return { error: "Valid 10-digit Indian mobile number required" };

    try {
        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        const { data: visit, error: visitErr } = await supabase
            .from('clinical_visits')
            .select('id, status, patient_id, clinic_id')
            .eq('id', visitId)
            .eq('clinic_id', business.id)
            .maybeSingle();
        if (visitErr) throw visitErr;

        if (!visit) return { error: "Visit not found" };
        if (visit.status !== 'WAITING' && visit.status !== 'TRIAGE_PENDING') return { error: "Cannot cancel an active or completed visit." };

        const { data: patient } = await supabase
            .from('patients')
            .select('phone_hash, phone')
            .eq('id', visit.patient_id)
            .single();

        let phoneMatches = false;
        if (patient?.phone_hash) {
            phoneMatches = hashPhone(cleanPhone) === patient.phone_hash;
        } else if (patient?.phone) {
            phoneMatches = patient.phone === cleanPhone;
        }

        if (!phoneMatches) return { error: "Phone number does not match this visit." };

        const { error: cancelError } = await supabase
            .from('clinical_visits')
            .update({ status: 'CANCELLED', previous_status: visit.status })
            .eq('id', visitId);

        if (cancelError) throw cancelError;

        await supabase.from('security_audit_logs').insert({
            clinic_id: business.id,
            action_type: 'PATIENT_SELF_CANCEL',
            table_name: 'clinical_visits',
            record_id: visitId
        });

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
export async function triggerManualCall(clinicSlug: string, visitId: string) {
    if (!visitId || !clinicSlug) return { error: "Missing data" };
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Clinic not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized" };

        const { data: visit } = await supabase
            .from('clinical_visits')
            .select('id, patient_id')
            .eq('id', visitId)
            .eq('clinic_id', business.id)
            .single();

        if (!visit) return { error: "Visit not found" };

        const { data: patient } = await supabase
            .from('patients')
            .select('phone, phone_encrypted')
            .eq('id', visit.patient_id)
            .single();

        let phone = patient?.phone;
        if (patient?.phone_encrypted) {
            phone = decryptPhone(patient.phone_encrypted);
        }

        if (!phone) return { error: "No phone number available" };

        return { success: true, phone };
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



// 8. PUBLIC TRACKING (NABH Compliant)
export async function getPublicTokenStatus(visitId: string) {
    if (!visitId) return { error: "Invalid ID" };
    try {
        const supabase = createAdminClient();
        const { data: visit, error: visitError } = await supabase
            .from('clinical_visits')
            .select(`
                id, token_number, status, is_priority,
                created_at, rating, session_id, clinic_id,
                sessions!inner(status)
            `)
            .eq('id', visitId)
            .maybeSingle();

        if (visitError) throw visitError;
        if (!visit) return { error: "Visit not found" };

        // Compute tokens ahead (Acuity Aware)
        const { data: waitingQueue } = await supabase
            .from('clinical_visits')
            .select('id')
            .eq('session_id', visit.session_id)
            .eq('status', 'WAITING')
            .order('is_priority', { ascending: false })
            .order('token_number', { ascending: true });

        const position = (waitingQueue || []).findIndex(v => v.id === visit.id);
        const tokensAhead = position > 0 ? position : 0;

        const { data: servingVisit } = await supabase
            .from('clinical_visits')
            .select('token_number, is_priority')
            .eq('session_id', visit.session_id)
            .eq('status', 'SERVING')
            .maybeSingle();

        const currentServing = servingVisit
            ? (servingVisit.is_priority ? `E-${servingVisit.token_number}` : `#${servingVisit.token_number}`)
            : "--";

        return {
            success: true,
            data: {
                token: {
                    id: visit.id,
                    token_number: visit.token_number,
                    status: visit.status,
                    is_priority: visit.is_priority,
                    session_status: ((visit as unknown as { sessions: { status: string } }).sessions?.status) || 'CLOSED',
                    rating: visit.rating,
                },
                tokens_ahead: tokensAhead,
                current_serving: currentServing,
            }
        };
    } catch (e) {
        console.error("Public Status Error:", e);
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

// ADVANCED CLINICAL MUTATION RPC WRAPPER
async function processQueueAction(slug: string, action: string, visitId?: string) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(slug);
        if (!business) return { error: "Business not found" };

        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized" };

        const session = await getActiveSession(business.id);
        if (!session) return { error: "No active session" };

        // Call Phase 13 Clinical Mutation RPC
        const { data, error } = await supabase.rpc('rpc_process_clinical_action', {
            p_clinic_id: business.id,
            p_session_id: session.id,
            p_staff_id: user.id,
            p_action: action,
            p_visit_id: visitId || null,
        });

        if (error) throw error;
        const result = data as { success: boolean; error?: string };
        if (!result.success) return { error: result.error || 'Action failed' };

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
export async function toggleArrivalStatus(clinicSlug: string, visitId: string, isArrived: boolean) {
    if (!visitId || !clinicSlug) return { error: "Missing data" };
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { error: "Unauthorized" };

        const supabase = createAdminClient();
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized" };

        const { error } = await supabase
            .from('clinical_visits')
            .update({
                registration_complete_time: isArrived ? new Date().toISOString() : null,
                status: isArrived ? 'WAITING' : 'WAITING'
            })
            .eq('id', visitId)
            .eq('clinic_id', business.id);

        if (error) throw error;
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

// DASHBOARD DATA (CLINICAL VERSION)
export async function getDashboardData(clinicSlug: string) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: "Unauthorized" };

        const today = getClinicDate();

        const { data: businessData } = await supabase.from('businesses').select('daily_token_limit').eq('id', business.id).single();

        const { data: session } = await supabase
            .from('sessions')
            .select('*')
            .eq('business_id', business.id)
            .eq('date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) return { session: null, tokens: [], dailyTokenLimit: businessData?.daily_token_limit || null, businessId: business.id };

        // JOIN Clinical Visits with Patients
        const { data: visits } = await supabase
            .from('clinical_visits')
            .select('*, patients(name, phone, phone_encrypted)')
            .eq('session_id', session.id)
            .in('status', ['WAITING', 'SERVING', 'SKIPPED', 'CANCELLED', 'SERVED'])
            .order('token_number', { ascending: true });

        const safeTokens = (visits || []).map((v) => {
            const visit = v as unknown as {
                patients: { name?: string, phone?: string, phone_encrypted?: string },
                registration_complete_time?: string,
                source?: string,
                token_number: number
            };
            const patient = visit.patients;
            let decryptedPhone = patient?.phone;
            if (patient?.phone_encrypted) {
                try { decryptedPhone = decryptPhone(patient.phone_encrypted); } catch { }
            }
            return {
                ...v,
                patient_name: patient?.name,
                patient_phone: decryptedPhone,
                customerPhone: decryptedPhone,
                customerName: patient?.name,
                isArrived: !!visit.registration_complete_time,
                source: visit.source || 'QR',
            };
        });

        return { session, tokens: safeTokens, dailyTokenLimit: businessData?.daily_token_limit || null, businessId: business.id };
    } catch (e) {
        console.error("Dashboard Data Fetch Error:", e);
        return { session: null, tokens: [], dailyTokenLimit: null, businessId: null, error: (e as Error).message };
    }
}

// 9. HISTORY (CLINICAL)
export async function getTokensForDate(clinicSlug: string, date: string, limit: number = 50, offset: number = 0) {
    const supabase = createAdminClient();
    try {
        const business = await getBusinessBySlug(clinicSlug);
        if (!business) return { error: "Business not found" };

        if (!await verifyClinicAccess(business.id)) return { error: "Unauthorized" };

        const { data: session } = await supabase.from('sessions').select('id').eq('business_id', business.id).eq('date', date).maybeSingle();
        if (!session) return { tokens: [], hasMore: false };

        const { data, count } = await supabase
            .from('clinical_visits')
            .select('id, token_number, status, is_priority, rating, feedback, created_at, patients(name, phone, phone_encrypted)', { count: 'exact' })
            .eq('session_id', session.id)
            .order('token_number', { ascending: true })
            .range(offset, offset + limit - 1);

        const hasMore = count ? offset + (data?.length || 0) < count : false;

        const tokens = (data || []).map((v) => {
            const visit = v as unknown as {
                id: string,
                token_number: number,
                status: string,
                patients?: { name?: string, phone?: string, phone_encrypted?: string }
            };
            const patient = visit.patients;
            let decryptedPhone = patient?.phone;
            if (patient?.phone_encrypted) {
                try { decryptedPhone = decryptPhone(patient.phone_encrypted); } catch { }
            }
            return {
                id: visit.id,
                tokenNumber: visit.token_number,
                customerName: patient?.name,
                customerPhone: decryptedPhone,
                status: visit.status,
                isPriority: v.is_priority,
                rating: v.rating,
                feedback: v.feedback,
                createdAt: v.created_at,
            };
        });

        return { tokens, hasMore };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
