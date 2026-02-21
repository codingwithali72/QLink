"use client";

export function ClinicStatusBadge() {
    return (
        <div className="bg-black/20 backdrop-blur px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5 text-white/90">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
        </div>
    );
}
