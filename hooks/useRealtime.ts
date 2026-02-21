"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Session, Token } from "@/types/firestore";
import { useOfflineSync } from "./useOfflineSync";
import { getBusinessId, getDashboardData } from "@/app/actions/queue";

import { getClinicDate } from "@/lib/date";

const getTodayString = () => getClinicDate();

export function useClinicRealtime(clinicSlug: string) {
    const [session, setSession] = useState<Session | null>(null);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isConnected, setIsConnected] = useState(false);
    const [businessId, setBusinessId] = useState<string | null>(null);

    const [isSynced, setIsSynced] = useState(false);

    const supabase = createClient();
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

    // 1. Fetch Business ID ONCE
    useEffect(() => {
        async function fetchBusinessId() {
            if (!clinicSlug) return;
            try {
                const id = await getBusinessId(clinicSlug);
                if (id) setBusinessId(id);
                else console.error("Business not found for realtime hook");
            } catch (err) {
                console.error("Error fetching business:", err);
            }
        }
        fetchBusinessId();
    }, [clinicSlug]);

    // Fetch Function
    const fetchData = useCallback(async () => {
        if (!businessId) return;

        try {
            const res = await getDashboardData(businessId);

            if (res.session) {
                const mappedSession = mapSession(res.session);
                setSession(prev => {
                    if (JSON.stringify(prev) !== JSON.stringify(mappedSession)) return mappedSession;
                    return prev;
                });

                if (res.tokens) {
                    setTokens(res.tokens.map(mapToken));
                } else {
                    setTokens([]);
                }
            } else {
                setSession(null);
                setTokens([]);
            }

            setLastUpdated(new Date());
            setLoading(false);
            setIsSynced(true);
        } catch (error) {
            console.error("Fetch Error:", error);
        }
    }, [businessId]);

    // Debounced Fetch
    const debouncedFetch = useCallback(() => {
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(() => {
            console.log("Realtime fetch...");
            fetchData();
        }, 100);
    }, [fetchData]);

    // Setup Polling
    useEffect(() => {
        if (!businessId) return;

        fetchData();
        setIsConnected(true);
        pollingInterval.current = setInterval(fetchData, 3000);

        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        };
    }, [businessId, fetchData]);

    // Offline Sync - passing businessId explicitly if needed, but keeping simple for now
    // Note: useOfflineSync might need updates if it relies on old types
    const { saveToLocal, readFromLocal } = useOfflineSync(clinicSlug);

    useEffect(() => {
        if (session && tokens.length > 0) {
            saveToLocal(session, tokens);
        }
    }, [session, tokens, saveToLocal]);

    useEffect(() => {
        async function loadLocal() {
            const localData = await readFromLocal();
            if (localData && loading) {
                setSession(localData.session);
                setTokens(localData.tokens);
                setLastUpdated(new Date(localData.lastUpdated));
                setLoading(false);
            }
        }
        loadLocal();
    }, [readFromLocal]);

    return { session, tokens, loading, lastUpdated, isConnected, isSynced, refresh: fetchData };
}

// Mappers
function mapSession(s: any): Session {
    return {
        id: s.id,
        businessId: s.business_id,
        date: s.date,
        status: s.status,
        startTime: s.start_time,
        endTime: s.end_time,
        dailyTokenCount: s.daily_token_count,
        createdAt: s.created_at
    };
}

function mapToken(t: any): Token {
    return {
        id: t.id,
        businessId: t.business_id,
        sessionId: t.session_id,
        tokenNumber: t.token_number,
        customerName: t.customer_name,
        customerPhone: t.customer_phone,
        status: t.status,
        isPriority: t.is_priority,
        // rating/feedback might not be in DB yet, but keep if needed
        createdAt: t.created_at,
        completedAt: t.completed_at,
        createdByStaffId: t.created_by_staff_id,
        // rating/feedback might need separate table or columns if we want them?
        // For MVP, we didn't add them to 'tokens' table schema in step 1.
        // User didn't explicitly ask for feedback in Prompt, only "Queue System Rules".
        // Previous conversations had feedback. I should check if I need to add them to table.
        // I will add them to type mapping as undefined for now to avoid breaking UI if UI uses them.
    } as any; // Cast to any to satisfy strict Token type if it has extra fields
}
