"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClinicStatusBadge({ clinicSlug }: { clinicSlug: string }) {
    // We only need the hook for connection status and re-renders
    useClinicRealtime(clinicSlug);

    return (
        <div className="bg-black/20 backdrop-blur px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5 text-white/90">
            <RefreshCw className="w-3 h-3 animate-spin duration-700 text-white" /> Synced
        </div>
    );
}
