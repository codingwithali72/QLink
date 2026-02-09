"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Session, Token, DBSession, DBToken } from "@/types/firestore";
import { useOfflineSync } from "./useOfflineSync";

const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useClinicRealtime(clinicSlug: string) {
    const [session, setSession] = useState<Session | null>(null);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isConnected, setIsConnected] = useState(false);
    const [clinicId, setClinicId] = useState<string | null>(null);

    const supabase = createClient();
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

    // 1. Fetch Clinic ID ONCE
    useEffect(() => {
        async function fetchClinicId() {
            if (!clinicSlug) return;
            // Try to get from local storage or cache if we had one, but for now just fetch once
            try {
                const { data, error } = await supabase
                    .from('clinics')
                    .select('id')
                    .eq('slug', clinicSlug)
                    .single();

                if (data) setClinicId(data.id);
                else console.error("Clinic not found:", error);
            } catch (err) {
                console.error("Error fetching clinic:", err);
            }
        }
        fetchClinicId();
    }, [clinicSlug]);

    // Fetch Function (Requires Clinic ID)
    const fetchData = useCallback(async () => {
        if (!clinicId) return;

        try {
            const today = getTodayString();

            // 2. Get Session (Using ID, no slug lookup)
            const { data: dbSession } = await supabase
                .from('sessions')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('date', today)
                .single();

            if (dbSession) {
                const mappedSession = mapSession(dbSession);
                // Only update state if changed (simple check) to avoid rerenders
                setSession(prev => {
                    if (JSON.stringify(prev) !== JSON.stringify(mappedSession)) return mappedSession;
                    return prev;
                });

                // 3. Get Tokens (Only needed if session exists)
                // Optimization: Maybe limit columns? Keeping * for safety for now.
                const { data: dbTokens } = await supabase
                    .from('tokens')
                    .select('*')
                    .eq('session_id', dbSession.id)
                    .order('token_number', { ascending: true }); // Keep all tokens for Reception, filter in UI

                if (dbTokens) {
                    setTokens(dbTokens.map(mapToken));
                }
            } else {
                setSession(null);
                setTokens([]);
            }

            setLastUpdated(new Date());
            setLoading(false);
        } catch (error) {
            console.error("Fetch Error:", error);
        }
    }, [clinicId]);

    // Debounced Fetch for Realtime
    const debouncedFetch = useCallback(() => {
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(() => {
            console.log("Realtime triggers fetch...");
            fetchData();
        }, 500); // 500ms debounce
    }, [fetchData]);

    // Setup Polling & Realtime
    useEffect(() => {
        if (!clinicId) return;

        // Initial Fetch
        fetchData();

        // POLL EVERY 20 SECONDS (Reduced from 3s)
        // We rely on Realtime for speed, Polling is just backup
        pollingInterval.current = setInterval(fetchData, 20000);

        // Realtime Subscription
        const channel = supabase.channel(`clinic:${clinicId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `clinic_id=eq.${clinicId}` }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens', filter: `clinic_id=eq.${clinicId}` }, debouncedFetch)
            .subscribe((status) => {
                setIsConnected(status === 'SUBSCRIBED');
            });

        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
            supabase.removeChannel(channel);
        };
    }, [clinicId, fetchData, debouncedFetch]);

    // Offline Sync Hook
    const { saveToLocal, readFromLocal } = useOfflineSync(clinicSlug);

    // Persist Data when it changes
    useEffect(() => {
        if (session && tokens.length > 0) {
            saveToLocal(session, tokens);
        }
    }, [session, tokens, saveToLocal]);

    // Initial Load: Try Local First if Network is slow or offline
    useEffect(() => {
        async function loadLocal() {
            const localData = await readFromLocal();
            if (localData && loading) {
                // Only use local if we are still loading (network hasn't responded yet)
                // Or if we are explicitly offline? 
                // Better strategy: "Stale-While-Revalidate"
                // Show local data immediately, then let network overwrite it.
                console.log("Loaded cached data", localData);
                setSession(localData.session);
                setTokens(localData.tokens);
                setLastUpdated(new Date(localData.lastUpdated));
                setLoading(false); // Show content immediately
            }
        }
        loadLocal();
    }, [readFromLocal]); // Runs once on mount effectively due to useCallback dep

    return {
        session,
        tokens,
        loading,
        lastUpdated,
        isConnected, // This is Realtime connection status
        refresh: fetchData
    };
}

// Mappers
function mapSession(s: DBSession): Session {
    return {
        id: s.id,
        clinicId: s.clinic_id,
        date: s.date,
        status: s.status,
        currentTokenNumber: s.current_token_number,
        lastTokenNumber: s.last_token_number,
        updatedAt: s.updated_at
    };
}

function mapToken(t: DBToken): Token {
    return {
        id: t.id,
        clinicId: t.clinic_id,
        sessionId: t.session_id,
        tokenNumber: t.token_number,
        customerName: t.customer_name,
        customerPhone: t.customer_phone,
        status: t.status,
        isPriority: t.is_priority,
        createdAt: t.created_at
    };
}
