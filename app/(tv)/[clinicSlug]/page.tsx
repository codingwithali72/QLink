"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { Loader2, AlertTriangle, Monitor, Clock } from "lucide-react";
import { useMemo, useEffect, useState } from "react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function TVDisplayPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, loading, isConnected } = useClinicRealtime(params.clinicSlug);

    // Auto-refresh logic on prolonged disconnect
    const [offlineSeconds, setOfflineSeconds] = useState(0);
    useEffect(() => {
        if (!isConnected && !loading) {
            const interval = setInterval(() => {
                setOfflineSeconds(prev => {
                    if (prev >= 60) {
                        window.location.reload(); // Hard refresh after 60s offline
                        return 0;
                    }
                    return prev + 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setOfflineSeconds(0);
        }
    }, [isConnected, loading]);

    // Force Dark Mode context
    useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
    }, []);

    const servingToken = useMemo(() => tokens.find(t => t.status === 'SERVING') || null, [tokens]);
    const waitingTokens = useMemo(() => {
        return tokens.filter(t => t.status === 'WAITING').sort((a, b) => {
            if (a.isPriority && !b.isPriority) return -1;
            if (!a.isPriority && b.isPriority) return 1;
            return a.tokenNumber - b.tokenNumber;
        }).slice(0, 10);
    }, [tokens]);

    if (loading) return (
        <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
            <Loader2 className="animate-spin text-slate-400 w-16 h-16 mb-4" />
            <h1 className="text-2xl font-bold tracking-widest text-slate-500 uppercase">QLink Display Sync</h1>
        </div>
    );

    return (
        <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col font-sans">
            {/* Header */}
            <header className="p-8 flex justify-between items-center bg-slate-900 border-b border-white/5">
                <div className="flex items-center gap-6">
                    <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-4xl shadow-lg shadow-blue-500/20">
                        Q
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight">{params.clinicSlug.toUpperCase()}</h1>
                        <p className="text-slate-400 tracking-widest uppercase text-lg mt-1 flex items-center gap-2">
                            <Monitor className="w-4 h-4" /> Live Queue Status
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className={`px-6 py-2 rounded-full border-2 text-xl font-bold uppercase tracking-widest flex items-center gap-3 ${session?.status === 'OPEN' ? 'border-green-500/50 text-green-400 bg-green-500/10' :
                            session?.status === 'PAUSED' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' :
                                'border-red-500/50 text-red-400 bg-red-500/10'
                        }`}>
                        <div className={`w-3 h-3 rounded-full ${session?.status === 'OPEN' ? 'bg-green-500 animate-pulse' :
                                session?.status === 'PAUSED' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                        {session?.status || 'CLOSED'}
                    </div>
                    {!isConnected && (
                        <p className="text-red-400 text-sm font-bold mt-2 animate-pulse flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Reconnecting ({offlineSeconds}s)
                        </p>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 grid grid-cols-12 gap-8 p-8 max-h-full">
                {/* Left: Now Serving */}
                <div className="col-span-8 bg-[#0F172A] border border-white/10 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-12 relative overflow-hidden">
                    <div className="absolute top-12 text-blue-400 font-bold uppercase tracking-[0.5em] text-3xl">Now Serving</div>

                    {servingToken ? (
                        <div className="text-center animate-in zoom-in-95 duration-700">
                            <h2 className="text-[20rem] leading-none font-black tracking-tighter text-white drop-shadow-2xl">
                                {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                            </h2>
                            <p className="text-5xl font-bold text-slate-300 mt-8">{servingToken.customerName || 'Patient'}</p>
                        </div>
                    ) : (
                        <div className="text-center opacity-40">
                            <div className="text-[15rem] leading-none font-black text-slate-700">--</div>
                            <p className="text-4xl mt-8 tracking-widest uppercase">Waiting</p>
                        </div>
                    )}
                </div>

                {/* Right: Up Next */}
                <div className="col-span-4 flex flex-col gap-6">
                    <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-8 flex-1 flex flex-col shadow-xl">
                        <h3 className="text-2xl font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                            <Clock className="w-6 h-6" /> Up Next
                        </h3>

                        <div className="flex-1 flex flex-col gap-4">
                            {waitingTokens.length > 0 ? (
                                waitingTokens.map((t, idx) => (
                                    <div key={t.id} className={`flex items-center justify-between p-6 rounded-2xl ${idx === 0 ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-800/50'
                                        }`}>
                                        <div className="flex items-center gap-6">
                                            <span className={`text-4xl font-black ${t.isPriority ? 'text-rose-400' : 'text-slate-200'}`}>
                                                {formatToken(t.tokenNumber, t.isPriority)}
                                            </span>
                                        </div>
                                        <span className="text-2xl font-bold text-slate-400 truncate max-w-[150px]">
                                            {t.customerName || `Token ${t.tokenNumber}`}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-slate-600 text-xl font-bold uppercase tracking-widest">
                                    Queue Empty
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
