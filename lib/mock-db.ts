/* eslint-disable */
// Mock In-Memory Store for Demo Mode (No DB)
import { Session, Token } from "@/types/firestore";

// Singleton Global State (preserves across hot reloads in dev mostly)
const globalStore: any = global as any;
if (!globalStore.mockDb) {
    globalStore.mockDb = {
        sessions: {},
        tokens: {},
        customers: {}
    };
}

const Store = globalStore.mockDb;

export const initDemoData = (slug: string) => {
    const today = new Date().toISOString().split('T')[0];
    const sessionKey = `${slug}_${today}`;

    if (!Store.sessions[sessionKey]) {
        Store.sessions[sessionKey] = {
            date: today,
            currentTokenNumber: 1,
            lastTokenNumber: 5, // Start with some pre-filled
            status: "OPEN",
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 }
        } as Session;

        // Create some dummy tokens
        for (let i = 1; i <= 5; i++) {
            const tId = `mock_token_${i}`;
            Store.tokens[tId] = {
                id: tId,
                tokenNumber: i,
                customerName: `Demo Visitor ${i}`,
                customerPhone: "555-0000",
                status: "WAITING",
                createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
                sessionId: today,
                clinicId: slug
            } as Token;
        }
    }
};

export const getMockSession = (slug: string) => {
    const today = new Date().toISOString().split('T')[0];
    const sessionKey = `${slug}_${today}`;
    initDemoData(slug);
    return Store.sessions[sessionKey];
};

export const getMockTokens = (slug: string) => {
    initDemoData(slug);
    return Object.values(Store.tokens).filter((t: any) => t.clinicId === slug);
};

export const createMockToken = (slug: string, phone: string, name: string) => {
    const today = new Date().toISOString().split('T')[0];
    const sessionKey = `${slug}_${today}`;
    initDemoData(slug);

    // Increment
    Store.sessions[sessionKey].lastTokenNumber++;
    const num = Store.sessions[sessionKey].lastTokenNumber;
    const tId = `mock_token_${Date.now()}`;

    const newToken = {
        id: tId,
        tokenNumber: num,
        customerName: name || "Demo User",
        customerPhone: phone,
        status: "WAITING",
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 },
        sessionId: today,
        clinicId: slug
    };

    Store.tokens[tId] = newToken;
    return newToken;
};

export const updateMockTokenStatus = (tId: string, status: string) => {
    if (Store.tokens[tId]) {
        Store.tokens[tId].status = status;
        // Logic for serving update
        if (status === 'SERVING') {
            // Update session current
            const t = Store.tokens[tId];
            const sessionKey = `${t.clinicId}_${t.sessionId}`;
            if (Store.sessions[sessionKey]) {
                Store.sessions[sessionKey].currentTokenNumber = t.tokenNumber;
            }
        }
    }
};
