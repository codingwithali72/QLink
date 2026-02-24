"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
    const [dailyTokenLimit, setDailyTokenLimit] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [isSynced, setIsSynced] = useState(false);

    const supabase = useMemo(() => createClient(), []);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

    // Fetch Function - single round trip now fetches mapping + data + limits
    const fetchData = useCallback(async () => {
        if (!clinicSlug) return;

        try {
            const res = await getDashboardData(clinicSlug);

            if (res.error) {
                setError(res.error);
                setIsConnected(false);
                setLoading(false);
                setIsSynced(true);
                return;
            }

            setDailyTokenLimit(res.dailyTokenLimit);
            if (res.businessId && !businessId) {
                setBusinessId(res.businessId);
            }

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

            setError(null);
            setLastUpdated(new Date());
            setIsConnected(true);
            setLoading(false);
            setIsSynced(true);
        } catch (err: any) {
            console.error("Dashboard Fetch Error:", err);
            setError(err.message || "Failed to fetch dashboard data");
            setIsConnected(false);
            setLoading(false);
            setIsSynced(true);
        }
    }, [clinicSlug, businessId]);

    // Debounced Fetch
    const debouncedFetch = useCallback(() => {
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(() => {
            console.log("Realtime fetch...");
            fetchData();
        }, 100);
    }, [fetchData]);

    // Initial load
    useEffect(() => {
        if (!isSynced && clinicSlug) {
            fetchData();
        }
    }, [isSynced, clinicSlug, fetchData]);


    // Realtime subscription setup
    useEffect(() => {
        if (!businessId) return;

        let isUnmounting = false;

        const channel = supabase.channel(`clinic-${businessId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'sessions', filter: `business_id=eq.${businessId}` },
                () => { debouncedFetch(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tokens', filter: `business_id=eq.${businessId}` },
                () => { debouncedFetch(); }
            )
            .subscribe((status, err) => {
                if (isUnmounting) return;

                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                    // Force full sync on connect/reconnect to catch any missed events during WiFi loss
                    fetchData();
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    setIsConnected(false);
                }
            });

        return () => {
            isUnmounting = true;
            supabase.removeChannel(channel);
        };
    }, [businessId, debouncedFetch, fetchData, supabase]);

    // Adaptive Polling Fallback
    // When Realtime is active, polling is entirely suspended (0 network traffic overhead).
    // When Realtime drops (WiFi swap, sleep wakeup, corporate firewall blocking WS), polling activates at 3s intervals.
    useEffect(() => {
        if (!businessId) return;

        let failCount = 0;

        // If connected to websockets, we don't need to poll at all.
        if (isConnected) {
            if (pollingInterval.current) clearTimeout(pollingInterval.current);
            return;
        }

        // When disconnected: Aggressive 3s fallback polling for sub-500ms feel even offline
        const BASE_INTERVAL = 3000;
        const MAX_INTERVAL = 30000;

        function scheduleNext() {
            const delay = Math.min(BASE_INTERVAL * Math.pow(2, failCount), MAX_INTERVAL);
            pollingInterval.current = setTimeout(async () => {
                if (document.visibilityState === 'hidden') {
                    failCount = 0;
                    scheduleNext();
                    return;
                }
                try {
                    await fetchData();
                    failCount = 0;
                } catch {
                    failCount = Math.min(failCount + 1, 4);
                }
                scheduleNext();
            }, delay);
        }

        scheduleNext();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                if (pollingInterval.current) clearTimeout(pollingInterval.current);
                failCount = 0;
                fetchData();
                scheduleNext();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (pollingInterval.current) clearTimeout(pollingInterval.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [businessId, fetchData, isConnected]);

    // Offline Sync - passing businessId explicitly if needed, but keeping simple for now
    // Note: useOfflineSync might need updates if it relies on old types
    const { saveToLocal, readFromLocal } = useOfflineSync(clinicSlug);

    useEffect(() => {
        if (session && tokens.length > 0) {
            saveToLocal(session, tokens);
        }
    }, [session, tokens, saveToLocal]);

    // NOTE: Disabled offline cache loading to prevent stale ghost tokens
    // The server action polling is the single source of truth
    // useEffect(() => {
    //     async function loadLocal() {
    //         const localData = await readFromLocal();
    //         if (localData && loading) {
    //             setSession(localData.session);
    //             setTokens(localData.tokens);
    //             setLastUpdated(new Date(localData.lastUpdated));
    //             setLoading(false);
    //         }
    //     }
    //     loadLocal();
    // }, [readFromLocal]);

    // Export setTokens/setSession for optimistic UI updates in the calling component.
    // The page applies local state immediately, then realtime subscription reconciles with truth.
    return { session, tokens, loading, error, lastUpdated, isConnected, businessId, refresh: debouncedFetch, dailyTokenLimit, setTokens, setSession };
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
        customerName: t.customerName || t.patient_name || "Guest",
        customerPhone: t.customerPhone || t.patient_phone || "",
        status: t.status,
        isPriority: t.is_priority,
        createdAt: t.created_at,
        completedAt: t.served_at,
        createdByStaffId: t.created_by_staff_id,
    } as any;
}
