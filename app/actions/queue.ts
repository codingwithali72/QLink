"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendSMS } from "@/lib/sms";

import { getClinicDate } from "@/lib/date";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const getTodayString = () => getClinicDate();

const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export async function createToken(clinicSlug: string, phone: string, name: string = "", isPriority: boolean = false) {
    if (!clinicSlug) return { error: "Missing clinic slug" };
    const supabase = createAdminClient();
    const today = getTodayString();

    try {
        const { data: clinic } = await supabase.from('clinics').select('id, name').eq('slug', clinicSlug).single();
        if (!clinic) throw new Error("Clinic not found");

        let { data: session } = await supabase.from('sessions').select('*').eq('clinic_id', clinic.id).eq('date', today).single();

        if (!session) {
            const { data: newSession, error: createError } = await supabase.from('sessions').insert({
                clinic_id: clinic.id, date: today, current_token_number: 0, last_token_number: 0, last_emergency_number: 0, status: 'OPEN'
            }).select().single();
            if (createError) throw createError;
            session = newSession;
        }

        if (session.status === 'CLOSED') throw new Error("Clinic is closed");
        if (session.status === 'PAUSED') throw new Error("Queue is currently paused");
        if (session.status === 'PAUSED') throw new Error("Queue is currently paused");

        // --- NEW LOGIC: SEPARATE COUNTERS ---
        let assignedNumber = 0;

        if (isPriority) {
            const { data: sessionUpdate } = await supabase.from('sessions')
                .update({ last_emergency_number: (session.last_emergency_number || 0) + 1 })
                .eq('id', session.id)
                .select().single();
            assignedNumber = sessionUpdate.last_emergency_number;
        } else {
            const { data: sessionUpdate } = await supabase.from('sessions')
                .update({ last_token_number: (session.last_token_number || 0) + 1 })
                .eq('id', session.id)
                .select().single();
            assignedNumber = sessionUpdate.last_token_number;
        }

        const { data: token, error: tokenError } = await supabase.from('tokens').insert({
            clinic_id: clinic.id, session_id: session.id, token_number: assignedNumber,
            customer_name: name || `Guest ${assignedNumber}`, customer_phone: phone, source: 'QR', status: 'WAITING', is_priority: isPriority
        }).select().single();

        if (tokenError) throw tokenError;

        // NON-BLOCKING SMS
        if (phone && phone.length > 5) {
            const trackingLink = `${BASE_URL}/${clinicSlug}/t/${token.id}`;
            const formattedToken = formatToken(token.token_number, token.is_priority);
            const msg = `Welcome to ${clinic.name}.\nYour Token: ${formattedToken}\nTrack Live: ${trackingLink}`;
            logMessageToDB(clinic.id, token.id, phone, msg, 'sms').catch(console.error);
            sendSMS(phone, msg).catch(console.error);
        }

        revalidatePath(`/${clinicSlug}`);
        return { success: true, token };

    } catch (e) {
        return { error: (e as Error).message };
    }
}

async function logMessageToDB(clinicId: string, tokenId: string, phone: string, text: string, channel: string) {
    const supabase = createClient();
    await supabase.from('message_logs').insert({
        clinic_id: clinicId, token_id: tokenId, phone, message_text: text, channel, status: 'sent'
    });
}

export async function nextPatient(clinicSlug: string) {
    const supabase = createClient();
    const today = getTodayString();

    try {
        // CALL ATOMIC DB FUNCTION
        const { data, error } = await supabase.rpc('next_patient_atomic', {
            p_clinic_slug: clinicSlug,
            p_date: today
        });

        if (error) throw error;

        // Define expected return type from RPC
        type NextPatientResult = {
            error?: string;
            success?: boolean;
            message?: string;
            token_id?: string;
            token_number: number;
            is_priority: boolean;
            customer_phone?: string;
            clinic_name?: string;
        };

        const result = data as unknown as NextPatientResult; // Type assertion

        if (result.error) return { error: result.error };
        if (!result.token_id) return { success: true, message: result.message }; // No patients

        // Helper to format string
        const formattedToken = formatToken(result.token_number, result.is_priority);

        // SMS LOGIC (Now decoupled from DB logic)
        if (result.customer_phone && result.customer_phone.length > 5) {
            const msg = `${result.clinic_name}: It's your turn! Ticket ${formattedToken}. Please proceed to reception.`;
            // Fire and forget logging provided we have IDs (we might need clinic_id back from RPC if we want to log accurately, 
            // but for now let's skip the heavy logging for speed or do it async)
            // Ideally RPC returns clinicID too.
            // For now, assuming simple SMS dispatch.
            sendSMS(result.customer_phone, msg).catch(console.error);
        }

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        console.error("Next Patient Error:", e);
        return { error: (e as Error).message };
    }
}

export async function skipToken(clinicSlug: string, tokenId: string) {
    try {
        const supabase = createClient();
        const { error } = await supabase.from('tokens').update({ status: 'SKIPPED' }).eq('id', tokenId);
        if (error) throw error;
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function cancelToken(clinicSlug: string, tokenId: string) {
    try {
        const supabase = createClient();
        const { error } = await supabase.from('tokens').update({ status: 'CANCELLED' }).eq('id', tokenId);
        if (error) throw error;
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function recallToken(clinicSlug: string, tokenId: string) {
    try {
        const supabase = createClient();
        // Logic Changed: Set status to WAITING, but keep is_priority AS IS.
        const { error } = await supabase.from('tokens').update({ status: 'WAITING' }).eq('id', tokenId);
        if (error) throw error;
        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function submitFeedback(clinicSlug: string, tokenId: string, rating: number, feedback: string) {
    try {
        const supabase = createAdminClient();
        const { error, count } = await supabase.from('tokens')
            .update({ rating, feedback })
            .eq('id', tokenId)
            .select()
            .single();

        if (error) throw error;
        // Count check is just for debugging; admin client will work if ID exists.

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function pauseQueue(clinicSlug: string) {
    try {
        const supabase = createClient();
        const today = getTodayString();
        const { data: clinic } = await supabase.from('clinics').select('id').eq('slug', clinicSlug).single();
        if (!clinic) throw new Error("Clinic not found");

        const { error } = await supabase.from('sessions').update({ status: 'PAUSED' }).eq('clinic_id', clinic.id).eq('date', today);
        if (error) throw error;

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function resumeQueue(clinicSlug: string) {
    try {
        const supabase = createClient();
        const today = getTodayString();
        const { data: clinic } = await supabase.from('clinics').select('id').eq('slug', clinicSlug).single();
        if (!clinic) throw new Error("Clinic not found");

        const { error } = await supabase.from('sessions').update({ status: 'OPEN' }).eq('clinic_id', clinic.id).eq('date', today);
        if (error) throw error;

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function addEmergencyToken(clinicSlug: string) {
    // True Priority = Triggers E-X logic
    return createToken(clinicSlug, "0000000000", "🚨 EMERGENCY", true);
}

export async function closeQueue(clinicSlug: string) {
    try {
        const supabase = createClient();
        const today = getTodayString();
        const { data: clinic } = await supabase.from('clinics').select('id').eq('slug', clinicSlug).single();
        if (!clinic) throw new Error("Clinic not found");

        const { error } = await supabase.from('sessions').update({ status: 'CLOSED' }).eq('clinic_id', clinic.id).eq('date', today);
        if (error) throw error;

        revalidatePath(`/${clinicSlug}`);
        return { success: true };
    } catch (e) {
        return { error: (e as Error).message };
    }
}

export async function getTokensForDate(clinicSlug: string, date: string) {
    const supabase = createClient();
    try {
        const { data: clinic } = await supabase.from('clinics').select('id').eq('slug', clinicSlug).single();
        if (!clinic) return { error: "Clinic not found" };

        const { data: session } = await supabase.from('sessions').select('id').eq('clinic_id', clinic.id).eq('date', date).single();
        if (!session) return { tokens: [] }; // No session = no tokens

        const { data: tokens } = await supabase.from('tokens')
            .select('*')
            .eq('session_id', session.id)
            .order('token_number', { ascending: true });

        return {
            tokens: tokens?.map(t => ({
                id: t.id,
                clinicId: t.clinic_id,
                sessionId: t.session_id,
                tokenNumber: t.token_number,
                customerName: t.customer_name,
                customerPhone: t.customer_phone,
                status: t.status,
                isPriority: t.is_priority,
                rating: t.rating,
                feedback: t.feedback,
                createdAt: t.created_at
            })) || []
        };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
