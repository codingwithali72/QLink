"use client";

import { useEffect, useCallback } from 'react';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Token, Session } from '@/types/firestore';

interface QLinkDB extends DBSchema {
    local_data: {
        key: string;
        value: {
            session: Session | null;
            tokens: Token[];
            lastUpdated: number;
        };
    };
    action_queue: {
        key: string;
        value: {
            id: string;
            action: string;
            payload: any;
            timestamp: number;
        };
    };
}

const DB_NAME = 'qlink-offline-v1';

export function useOfflineSync(clinicSlug: string) {

    // Initialize DB
    const getDB = useCallback(async () => {
        return openDB<QLinkDB>(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('local_data')) {
                    db.createObjectStore('local_data');
                }
                if (!db.objectStoreNames.contains('action_queue')) {
                    db.createObjectStore('action_queue', { keyPath: 'id' });
                }
            },
        });
    }, []);

    // Save Data to Local (Cache)
    const saveToLocal = useCallback(async (session: Session | null, tokens: Token[]) => {
        try {
            const db = await getDB();
            await db.put('local_data', {
                session,
                tokens,
                lastUpdated: Date.now()
            }, clinicSlug);
        } catch (e) {
            console.error("Offline Save Error:", e);
        }
    }, [clinicSlug, getDB]);

    // Read Data from Local (Offline Fallback)
    const readFromLocal = useCallback(async () => {
        try {
            const db = await getDB();
            const data = await db.get('local_data', clinicSlug);
            return data; // { session, tokens, lastUpdated }
        } catch (e) {
            console.error("Offline Read Error:", e);
            return null;
        }
    }, [clinicSlug, getDB]);

    return { saveToLocal, readFromLocal };
}
