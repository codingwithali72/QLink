"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Session, Token, Department, Doctor } from "@/types/firestore";
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
    const [servedCount, setServedCount] = useState<number>(0);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [isSynced, setIsSynced] = useState(false);
    const { saveToLocal, readFromLocal } = useOfflineSync(clinicSlug);

    const supabase = useMemo(() => createClient(), []);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

    const lastActionRef = useRef<number>(0);
    const setOptimisticTokens = useCallback((newTokens: Token[] | ((prev: Token[]) => Token[])) => {
        lastActionRef.current = Date.now();
        setTokens(newTokens);
    }, []);

    // Fetch Function - single round trip now fetches mapping + data + limits
    const fetchData = useCallback(async () => {
        if (!clinicSlug) return;

        try {
            const res = await getDashboardData(clinicSlug);

            if (res.error) {
                // Fix 4: Try local fallback on error
                const cached = await readFromLocal();
                if (cached) {
                    setSession(cached.session);
                    setTokens(cached.tokens);
                    setError(`${res.error} (Showing Offline Data)`);
                } else {
                    setError(res.error);
                }
                setIsConnected(false);
                setLoading(false);
                setIsSynced(true);
                return;
            }

            setDailyTokenLimit(res.dailyTokenLimit);
            if (res.businessId && !businessId) {
                setBusinessId(res.businessId);
            }
            if (typeof res.servedCount === 'number') {
                setServedCount(res.servedCount);
            }
            if (res.departments) setDepartments(res.departments as Department[]);
            if (res.doctors) setDoctors(res.doctors as Doctor[]);

            // STABILIZATION: Ignore server results for 2.5s after a local action
            // to allow DB replication/caching to settle and prevent "ghost" state flicker.
            const timeSinceLastAction = Date.now() - lastActionRef.current;
            if (timeSinceLastAction > 2500) {
                if (res.session) {
                    const mappedSession = mapSession(res.session);

                    // Versioning check: If incoming session has a lower now_serving than our current state,
                    // it's likely a stale broadcast from a replica. Ignore it.
                    setSession(prev => {
                        if (prev && mappedSession.nowServingNumber < prev.nowServingNumber) {
                            console.log("Ignoring stale session data (now_serving fallback)");
                            return prev;
                        }
                        return mappedSession;
                    });

                    if (res.tokens) {
                        const mappedTokens = res.tokens.map(mapToken);
                        setTokens(prev => {
                            // If we have more served tokens in current state than the incoming fetch, ignore the fetch.
                            const currentServed = prev.filter(t => t.status === 'SERVED').length;
                            const incomingServed = mappedTokens.filter(t => t.status === 'SERVED').length;
                            if (incomingServed < currentServed && timeSinceLastAction < 5000) {
                                console.log("Ignoring stale token data (served_count fallback)");
                                return prev;
                            }
                            return mappedTokens;
                        });
                    } else {
                        setTokens([]);
                    }
                } else {
                    setSession(null);
                    setTokens([]);
                }
            }

            setError(null);
            setLastUpdated(new Date());
            setIsConnected(true);
            setLoading(false);
            setIsSynced(true);
        } catch (err: any) {
            console.error("Dashboard Fetch Error:", err);
            // Fix 4: Try local fallback on catch
            const cached = await readFromLocal();
            if (cached) {
                setSession(cached.session);
                setTokens(cached.tokens);
                setError("Connectivity Lost (Showing Offline Data)");
            } else {
                setError(err.message || "Failed to fetch dashboard data");
            }
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
                { event: '*', schema: 'public', table: 'clinical_visits', filter: `clinic_id=eq.${businessId}` },
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
    useEffect(() => {
        if (!businessId) return;

        let failCount = 0;

        // Heartbeat logic: Even if connected, poll occasionally to recover from silent drops
        const HEARTBEAT_INTERVAL = 45000; // 45s heartbeat while connected
        const BASE_INTERVAL = 3000;
        const MAX_INTERVAL = 30000;

        function scheduleNext() {
            const delay = isConnected
                ? HEARTBEAT_INTERVAL
                : Math.min(BASE_INTERVAL * Math.pow(2, failCount), MAX_INTERVAL);

            pollingInterval.current = setTimeout(async () => {
                if (document.visibilityState === 'hidden' && !isConnected) {
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

    useEffect(() => {
        if (session && tokens.length > 0) {
            saveToLocal(session, tokens);
        }
    }, [session, tokens, saveToLocal]);

    return { session, tokens, departments, doctors, loading, error, lastUpdated, isConnected, businessId, refresh: debouncedFetch, dailyTokenLimit, servedCount, setTokens: setOptimisticTokens, setSession };
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
        nowServingNumber: s.now_serving_number || 0,
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
        departmentId: t.departmentId,
        doctorId: t.doctorId,
    } as any;
}
