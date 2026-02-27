export type Business = {
    id: string; // UUID
    slug: string;
    name: string;
    settings: {
        queueRules?: string;
        maxTokensPerDay?: number;
    };
    isActive: boolean;
    createdAt: string;
};

export type StaffUser = {
    id: string; // UUID (matches auth.users)
    businessId: string;
    role: 'owner' | 'admin' | 'staff';
    email: string;
    fullName?: string;
};

export type Session = {
    id: string; // UUID
    businessId: string;
    date: string; // YYYY-MM-DD
    status: 'OPEN' | 'CLOSED' | 'PAUSED';
    startTime: string | null;
    endTime: string | null;
    dailyTokenCount: number;
    nowServingNumber: number;
    createdAt: string;
};

export type Token = {
    id: string; // UUID
    businessId: string;
    sessionId: string;
    tokenNumber: number;
    customerPhone: string;
    customerName: string;
    status: 'WAITING' | 'SERVING' | 'SERVED' | 'SKIPPED' | 'CANCELLED' | 'WAITING_LATE';
    isPriority: boolean;
    createdAt: string;
    completedAt: string | null;
    createdByStaffId?: string;
    isArrived?: boolean;
    graceExpiresAt?: string | null;
    source?: string;
};

export type AuditLog = {
    id: string;
    businessId: string;
    staffId: string;
    action: 'NEXT' | 'ADD' | 'SKIP' | 'CANCEL' | 'PAUSE' | 'RESUME' | 'EMERGENCY';
    details: any;
    createdAt: string;
};

// ==========================================
// CLINICAL & NABH MODELS (PHASE 1-4)
// ==========================================

export type Patient = {
    id: string;
    clinicId: string;
    name: string;
    phone: string | null;
    phoneHash: string | null;
    phoneEncrypted: string | null;
    abhaAddress?: string;
    dateOfBirth?: string;
    gender?: 'M' | 'F' | 'O';
    isMinor: boolean;
    createdAt: string;
};

export type PatientConsent = {
    id: string;
    patientId: string;
    consentType: 'DATA_PROCESSING' | 'INSURANCE_SHARING' | 'TELE_CONSULT';
    isGranted: boolean;
    grantedAt: string;
    withdrawnAt?: string;
};

export type ClinicalVisit = {
    id: string;
    clinicId: string;
    sessionId: string;
    patientId: string;
    tokenNumber: number;
    visitType: 'OPD' | 'ER' | 'IPD' | 'DIAGNOSTIC';
    status: 'WAITING' | 'TRIAGE_PENDING' | 'TRIAGE_COMPLETE' | 'SERVING' | 'SERVED' | 'SKIPPED' | 'CANCELLED';

    // NABH Timestamps
    arrivalAtDepartmentTime: string;
    triageStartTime?: string;
    triageEndTime?: string;
    consultantAssessmentStartTime?: string;
    dischargeOrderTime?: string;
    dischargeCompletedTime?: string;

    createdAt: string;
};

export type TriageRecord = {
    id: string;
    visitId: string;
    esiScore: 1 | 2 | 3 | 4 | 5;
    complaintSummary: string;
    vitalSigns?: any;
    slaDeadline: string;
    escalatedAt?: string;
    createdAt: string;
};

