"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcutMap {
    /** e.g. 'n' → Call Next Patient */
    [key: string]: () => void;
}

/**
 * useKeyboardShortcuts
 * 
 * Binds keyboard shortcuts for the Reception Dashboard.
 * Ignores keys when the user is typing in an input/textarea/select.
 * 
 * Usage:
 *   useKeyboardShortcuts({
 *     'n': handleNext,
 *     's': handleSkip,
 *     'e': handleEmergency,
 *     'p': handlePauseToggle,
 *   });
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcutMap): void {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if user is typing in an input field
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        // Ignore modifier keys combos (let browser shortcuts pass through)
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toLowerCase();
        if (shortcuts[key]) {
            e.preventDefault();
            shortcuts[key]();
        }
    }, [shortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
