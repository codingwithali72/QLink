"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { Loader2, AlertTriangle, Monitor, Clock, UserRound } from "lucide-react";
import { useMemo, useEffect, useState } from "react";


// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function TVDisplayPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, doctors, departments, loading, isConnected } = useClinicRealtime(params.clinicSlug);

    // Auto-refresh logic on prolonged disconnect
    const [offlineSeconds, setOfflineSeconds] = useState(0);
    useEffect(() => {
        if (!isConnected && !loading) {
            const interval = setInterval(() => {
                setOfflineSeconds(prev => {
                    if (prev >= 60) {
                        window.location.reload();
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

    // Grouping Logic for Hospital Zones
    const zones = useMemo(() => {
        if (!doctors || doctors.length === 0) {
            // Fallback: No doctors defined, just group by department or generic
            const serving = tokens.find(t => t.status === 'SERVING');
            const waiting = tokens.filter(t => t.status === 'WAITING').sort((a, b) => a.tokenNumber - b.tokenNumber).slice(0, 5);
            return [{
                id: 'generic',
                name: 'Main Queue',
                subtitle: '',
                serving,
                waiting
            }];
        }

        return doctors.map(doc => {
            const dept = departments.find(d => d.id === doc.department_id);
            const docTokens = tokens.filter(t => t.doctorId === doc.id || (t.departmentId === doc.department_id && !t.doctorId));
            const serving = docTokens.find(t => t.status === 'SERVING');
            const waiting = docTokens.filter(t => t.status === 'WAITING').sort((a, b) => {
                if (a.isPriority && !b.isPriority) return -1;
                if (!a.isPriority && b.isPriority) return 1;
                return a.tokenNumber - b.tokenNumber;
            }).slice(0, 5);

            return {
                id: doc.id,
                name: `Dr. ${doc.name}`,
                subtitle: dept?.name || '',
                serving,
                waiting
            };
        }).filter(z => z.serving || z.waiting.length > 0); // Hide empty zones to save screen space
    }, [tokens, doctors, departments]);


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
                            <Monitor className="w-4 h-4" /> Live Hospital Display
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

            {/* Main Content - Dynamic Grid based on Zones */}
            <div className="flex-1 p-8 overflow-y-auto">
                {zones.length > 0 ? (
                    <div className={`grid gap-8 ${zones.length === 1 ? 'grid-cols-1 max-w-5xl mx-auto' : zones.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {zones.map(zone => (
                            <div key={zone.id} className="bg-slate-900 border border-white/10 rounded-[2rem] shadow-xl overflow-hidden flex flex-col">
                                {/* Zone Header */}
                                <div className="bg-slate-800/80 p-6 border-b border-white/5 flex items-center gap-4">
                                    <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
                                        <UserRound className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold tracking-tight">{zone.name}</h2>
                                        {zone.subtitle && <p className="text-blue-400 font-semibold tracking-widest uppercase text-sm mt-1">{zone.subtitle}</p>}
                                    </div>
                                </div>

                                <div className="p-8 flex-1 flex flex-col lg:flex-row gap-8 items-center justify-between">
                                    {/* Serving */}
                                    <div className="flex-1 flex flex-col items-center justify-center text-center w-full">
                                        <div className="text-blue-400 font-bold uppercase tracking-[0.2em] mb-4">Now Serving</div>
                                        {zone.serving ? (
                                            <div className="animate-in zoom-in-95 duration-700">
                                                <h3 className="text-8xl lg:text-[10rem] leading-none font-black tracking-tighter text-white drop-shadow-lg">
                                                    {formatToken(zone.serving.tokenNumber, zone.serving.isPriority)}
                                                </h3>
                                                <p className="text-3xl font-bold text-slate-300 mt-4 truncate max-w-[300px]">{zone.serving.customerName || 'Patient'}</p>
                                            </div>
                                        ) : (
                                            <div className="opacity-30">
                                                <div className="text-8xl lg:text-[10rem] leading-none font-black text-slate-600">--</div>
                                                <p className="text-2xl mt-4 tracking-widest uppercase">Waiting</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Next Up */}
                                    <div className="w-full lg:w-1/3 bg-slate-950/50 rounded-3xl p-6 border border-white/5">
                                        <h4 className="text-slate-500 uppercase font-bold tracking-widest mb-4 flex items-center gap-2 text-sm">
                                            <Clock className="w-4 h-4" /> Next Up
                                        </h4>
                                        <div className="space-y-3">
                                            {zone.waiting.length > 0 ? zone.waiting.map(t => (
                                                <div key={t.id} className="flex justify-between items-center bg-slate-900 p-4 rounded-xl">
                                                    <span className={`text-2xl font-black ${t.isPriority ? 'text-rose-400' : 'text-slate-200'}`}>
                                                        {formatToken(t.tokenNumber, t.isPriority)}
                                                    </span>
                                                    <span className="text-slate-400 font-semibold truncate max-w-[120px]">{t.customerName}</span>
                                                </div>
                                            )) : (
                                                <div className="text-center text-slate-600 py-8 font-semibold">Queue Empty</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <Monitor className="w-32 h-32 mb-8" />
                        <h2 className="text-4xl font-bold tracking-widest uppercase">No Active Queues</h2>
                    </div>
                )}
            </div>
        </div>
    );
}
