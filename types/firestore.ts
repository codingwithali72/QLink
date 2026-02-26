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
