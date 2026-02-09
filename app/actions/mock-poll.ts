
"use server";

import { getMockSession, getMockTokens } from "@/lib/mock-db";

export async function pollMockData(clinicSlug: string) {
    // Return both session and tokens for efficiency
    const session = getMockSession(clinicSlug);
    const tokens = getMockTokens(clinicSlug);
    return { session, tokens };
}
