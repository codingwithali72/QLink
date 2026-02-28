import { createAdminClient } from "@/lib/supabase/admin";

// =================================================================================
// QLINK WHATSAPP INTENT ROUTER & SESSION STATE MACHINE
// Processes inbound payloads from the webhook and routes to the correct handler.
// This is the "Processing Layer" of the 4-layer WhatsApp architecture.
// =================================================================================

export type WaFlowState =
    | 'IDLE'
    | 'AWAITING_JOIN_CONFIRM'
    | 'AWAITING_DEPT_SELECT'
    | 'AWAITING_DOC_SELECT'
    | 'ACTIVE_TOKEN'
    | 'RATING_PENDING';

export interface WaConversationContext {
    id: string;
    phone: string;
    state: WaFlowState;
    business_id: string | null;
    active_visit_id: string | null;
    pending_dept_id: string | null;
    pending_doc_id: string | null;
    last_interaction: string;
}

export type WaIntent =
    | 'JOIN_CLINIC'
    | 'STATUS_CHECK'
    | 'CANCEL_TOKEN'
    | 'CONFIRM_CANCEL'
    | 'DENY_CANCEL'
    | 'SELECT_DEPARTMENT'
    | 'SELECT_DOCTOR'
    | 'SUBMIT_RATING'
    | 'BUTTON_IM_ON_MY_WAY'
    | 'UNKNOWN';

/**
 * Identifies the Intent from inbound text or interactive reply.
 */
export function detectIntent(
    messageText: string,
    interactiveId: string,
    state: WaFlowState
): WaIntent {
    const text = messageText.toUpperCase().trim();

    // Interactive button/list replies take priority
    if (interactiveId) {
        if (interactiveId.startsWith('DEPT_')) return 'SELECT_DEPARTMENT';
        if (interactiveId.startsWith('DOC_')) return 'SELECT_DOCTOR';
        if (interactiveId === 'CANCEL_CONFIRM') return 'CONFIRM_CANCEL';
        if (interactiveId === 'CANCEL_DENY') return 'DENY_CANCEL';
        if (interactiveId === 'IM_ON_MY_WAY') return 'BUTTON_IM_ON_MY_WAY';
        if (interactiveId.startsWith('RATING_')) return 'SUBMIT_RATING';
    }

    // Text-based intents
    if (text === 'STATUS' || text === 'S') return 'STATUS_CHECK';
    if (text === 'CANCEL' || text === 'C') return 'CANCEL_TOKEN';
    if (/^[1-5]$/.test(text) && state === 'RATING_PENDING') return 'SUBMIT_RATING';

    // JOIN with clinic slug: e.g. "JOIN apollo-andheri"
    if (text.startsWith('JOIN ') && text.length > 5) return 'JOIN_CLINIC';

    return 'UNKNOWN';
}

/**
 * Processes a detected Intent within the current conversation context.
 * Returns a structured response or action for the webhook handler.
 */
export async function processIntent(
    intent: WaIntent,
    phone: string,
    name: string,
    messageText: string,
    interactiveId: string,
    conv: WaConversationContext,
    supabase: ReturnType<typeof createAdminClient>
): Promise<{ action: string; payload?: Record<string, unknown>; newState?: WaFlowState }> {

    switch (intent) {
        case 'JOIN_CLINIC': {
            const slug = messageText.split(' ')[1]?.toLowerCase().trim();
            if (!slug) return { action: 'SEND_TEMPLATE', payload: { templateName: 'join_error_utility', variables: [] } };

            const { data: branch } = await supabase
                .from('businesses')
                .select('id, name, settings')
                .eq('slug', slug)
                .eq('is_active', true)
                .maybeSingle();

            if (!branch) return { action: 'SEND_TEMPLATE', payload: { templateName: 'clinic_not_found_utility', variables: [{ type: 'text', text: slug }] } };

            // Fetch departments for the branch
            const { data: departments } = await supabase
                .from('departments')
                .select('id, name')
                .eq('clinic_id', branch.id)
                .eq('is_active', true);

            if (!departments || departments.length === 0) {
                // Single queue clinic - auto flow straight to token
                return {
                    action: 'CREATE_TOKEN_AUTO',
                    payload: { businessId: branch.id, businessName: branch.name, deptId: null, docId: null },
                    newState: 'ACTIVE_TOKEN'
                };
            }

            return {
                action: 'SEND_DEPT_LIST',
                payload: { businessId: branch.id, businessName: branch.name, departments },
                newState: 'AWAITING_DEPT_SELECT'
            };
        }

        case 'SELECT_DEPARTMENT': {
            const deptId = interactiveId.replace('DEPT_', '');
            const { data: dept } = await supabase.from('departments').select('id, name').eq('id', deptId).single();
            if (!dept) return { action: 'SEND_TEMPLATE', payload: { templateName: 'generic_error_utility', variables: [] } };

            // Check if department has multiple doctors
            const { data: doctors } = await supabase.from('doctors').select('id, name').eq('department_id', deptId).eq('is_active', true);

            if (!doctors || doctors.length <= 1) {
                // Auto-assign single doctor or no doctor
                return {
                    action: 'CREATE_TOKEN_AUTO',
                    payload: { deptId, docId: doctors?.[0]?.id || null },
                    newState: 'ACTIVE_TOKEN'
                };
            }

            return {
                action: 'SEND_DOC_LIST',
                payload: { deptId, doctors },
                newState: 'AWAITING_DOC_SELECT'
            };
        }

        case 'SELECT_DOCTOR': {
            const docId = interactiveId.replace('DOC_', '');
            return {
                action: 'CREATE_TOKEN_AUTO',
                payload: { docId, deptId: conv.pending_dept_id },
                newState: 'ACTIVE_TOKEN'
            };
        }

        case 'STATUS_CHECK': {
            if (!conv.active_visit_id) return { action: 'SEND_TEMPLATE', payload: { templateName: 'no_active_token_utility', variables: [] } };
            return { action: 'SEND_STATUS', payload: { visitId: conv.active_visit_id } };
        }

        case 'CANCEL_TOKEN': {
            if (!conv.active_visit_id) return { action: 'SEND_TEMPLATE', payload: { templateName: 'no_active_token_utility', variables: [] } };
            return { action: 'SEND_CANCEL_CONFIRM', payload: { visitId: conv.active_visit_id } };
        }

        case 'CONFIRM_CANCEL': {
            if (!conv.active_visit_id) return { action: 'NONE' };
            return { action: 'CANCEL_TOKEN', payload: { visitId: conv.active_visit_id }, newState: 'IDLE' };
        }

        case 'SUBMIT_RATING': {
            const ratingValue = interactiveId.startsWith('RATING_')
                ? parseInt(interactiveId.replace('RATING_', ''))
                : parseInt(messageText.trim());
            return { action: 'SAVE_RATING', payload: { visitId: conv.active_visit_id, rating: ratingValue }, newState: 'IDLE' };
        }

        case 'BUTTON_IM_ON_MY_WAY':
            return { action: 'MARK_ARRIVED', payload: { visitId: conv.active_visit_id } };

        default:
            return { action: 'SEND_TEMPLATE', payload: { templateName: 'help_menu_utility', variables: [] } };
    }
}
