export type TokenStatus = 'WAITING' | 'SERVING' | 'SERVED' | 'SKIPPED' | 'CANCELLED' | 'DONE';

export interface Session {
    id: string;
    clinicId: string;
    date: string;
    status: 'OPEN' | 'PAUSED' | 'CLOSED';
    currentTokenNumber: number;
    lastTokenNumber: number;
    updatedAt: string;
}

export interface Token {
    id: string;
    clinicId: string;
    sessionId: string;
    tokenNumber: number;
    customerName: string;
    customerPhone: string;
    status: TokenStatus;
    isPriority: boolean;
    createdAt: string;
}

// Database helper types (Snake case)
export interface DBSession {
    id: string;
    clinic_id: string;
    date: string;
    status: 'OPEN' | 'PAUSED' | 'CLOSED';
    current_token_number: number;
    last_token_number: number;
    updated_at: string;
}

export interface DBToken {
    id: string;
    clinic_id: string;
    session_id: string;
    token_number: number;
    customer_name: string;
    customer_phone: string;
    status: TokenStatus;
    is_priority: boolean;
    created_at: string;
}
