"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { Loader2, Clock, UserRound, Maximize, Activity } from "lucide-react";
import { useMemo, useEffect, useState, useRef, useCallback } from "react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function TVDisplayPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, doctors, departments, loading, isConnected } = useClinicRealtime(params.clinicSlug);

    // Auto-refresh logic on prolonged disconnect
    const [, setOfflineSeconds] = useState(0);
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

    // Force Dark Mode context for TV
    useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
    }, []);

    const lastServingRef = useRef<string | null>(null);
    const servingToken = useMemo(() => tokens.find(t => t.status === 'SERVING'), [tokens]);
    const [callAnimation, setCallAnimation] = useState(false);

    const playChime = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const playNote = (freq: number, start: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
                gainNode.gain.setValueAtTime(0.3, ctx.currentTime + start);
                gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
                osc.start(ctx.currentTime + start);
                osc.stop(ctx.currentTime + start + duration);
            };
            playNote(523, 0, 0.25); // C5
            playNote(659, 0.25, 0.25); // E5
            playNote(784, 0.5, 0.5);  // G5
        } catch { /* Audio blocked */ }
    }, []);

    useEffect(() => {
        if (!servingToken) return;
        if (lastServingRef.current !== servingToken.id) {
            lastServingRef.current = servingToken.id;
            playChime();
            setCallAnimation(true);
            setTimeout(() => setCallAnimation(false), 3000);
        }
    }, [servingToken, playChime]);

    // Auto-hide cursor
    useEffect(() => {
        document.body.style.cursor = 'none';
        return () => { document.body.style.cursor = ''; };
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }, []);

    const zones = useMemo(() => {
        if (!doctors || doctors.length === 0) {
            const serving = tokens.find(t => t.status === 'SERVING');
            const waiting = tokens.filter(t => t.status === 'WAITING').sort((a, b) => a.tokenNumber - b.tokenNumber).slice(0, 5);
            return [{ id: 'generic', name: 'Main Queue', subtitle: 'Reception Area', serving, waiting }];
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

            return { id: doc.id, name: `Dr. ${doc.name}`, subtitle: dept?.name || 'Specialist', serving, waiting };
        }).filter(z => z.serving || z.waiting.length > 0);
    }, [tokens, doctors, departments]);

    if (loading) return (
        <div className="h-screen bg-[#020617] flex flex-col items-center justify-center text-white font-sans">
            <Loader2 className="animate-spin text-indigo-500 w-24 h-24 mb-6 opacity-20" />
            <h1 className="text-xl font-black tracking-[0.5em] text-indigo-300 uppercase animate-pulse">Synchronizing Grid</h1>
        </div>
    );

    return (
        <div className="h-screen w-screen bg-[#020617] text-white overflow-hidden flex flex-col font-sans selection:bg-indigo-500/30">
            {/* Dynamic Background Glows */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
                <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[150px] rounded-full"></div>
                <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-emerald-600/10 blur-[150px] rounded-full"></div>
            </div>

            {/* Header: High-End Minimalist */}
            <header className="p-10 flex justify-between items-center border-b border-white/5 bg-slate-950/20 backdrop-blur-md">
                <div className="flex items-center gap-8">
                    <div className="h-20 w-20 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] flex items-center justify-center font-black text-5xl shadow-2xl shadow-indigo-600/40 border border-white/10">
                        Q
                    </div>
                    <div>
                        <h1 className="text-5xl font-black tracking-tighter text-white leading-none mb-2">{params.clinicSlug.toUpperCase()}</h1>
                        <div className="flex items-center gap-4">
                            <span className="text-indigo-400 font-bold tracking-[0.2em] uppercase text-sm">Live Orchestration Dashboard</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                            <span className="text-slate-500 font-bold text-sm tabular-nums tracking-widest">{new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className={`px-8 py-3 rounded-full border border-white/10 bg-white/5 backdrop-blur-3xl flex items-center gap-4 transition-all duration-500`}>
                        <div className={`w-3 h-3 rounded-full ${session?.status === 'OPEN' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'} animate-pulse`} />
                        <span className="text-2xl font-black tracking-tighter uppercase tabular-nums">
                            {session?.status || 'OFFLINE'}
                        </span>
                    </div>
                    <button onClick={toggleFullscreen} className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-slate-400">
                        <Maximize className="w-6 h-6" />
                    </button>
                </div>
            </header>

            {/* Main Content Floor */}
            <div className="flex-1 flex overflow-hidden">
                {/* QUEUE GRID */}
                <div className="flex-1 p-10 overflow-y-auto">
                    {zones.length > 0 ? (
                        <div className={`grid gap-10 h-full ${zones.length === 1 ? 'grid-cols-1' : zones.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {zones.map(zone => (
                                <div key={zone.id} className="relative group rounded-[3rem] bg-white/[0.03] border border-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-700 hover:border-indigo-500/30">
                                    {/* Zone Header Decor */}
                                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>

                                    {/* Doctor Identity */}
                                    <div className="p-8 pb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform duration-500">
                                                <UserRound className="w-8 h-8 text-indigo-400" />
                                            </div>
                                            <div>
                                                <h2 className="text-3xl font-black tracking-tight">{zone.name}</h2>
                                                <p className="text-indigo-400 font-bold tracking-widest uppercase text-xs mt-1">{zone.subtitle}</p>
                                            </div>
                                        </div>
                                        {zone.serving && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                                <Activity className="w-3 h-3 animate-pulse" /> Active Session
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 p-10 pt-4 flex flex-col xl:flex-row gap-10 items-center">
                                        {/* Large Serving Display */}
                                        <div className="flex-1 text-center w-full">
                                            <div className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs mb-6">Currently Serving</div>
                                            {zone.serving ? (
                                                <div className={`transition-all duration-1000 ${callAnimation && zone.serving?.id === servingToken?.id ? 'scale-110 blur-0' : 'scale-100'}`}>
                                                    <h3 className="text-[12rem] xl:text-[14rem] leading-none font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                                        {formatToken(zone.serving.tokenNumber, zone.serving.isPriority)}
                                                    </h3>
                                                    <div className="text-4xl font-bold text-indigo-300 mt-6 tracking-tight truncate px-4">{zone.serving.customerName || 'Patient'}</div>
                                                </div>
                                            ) : (
                                                <div className="opacity-10 py-10">
                                                    <div className="text-[10rem] xl:text-[12rem] leading-none font-black italic">--</div>
                                                    <p className="text-2xl mt-4 tracking-[0.5em] uppercase font-black">IDLE</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dynamic Next List */}
                                        <div className="w-full xl:w-[320px] bg-black/40 rounded-[2.5rem] p-8 border border-white/5 flex flex-col">
                                            <h4 className="text-indigo-400 uppercase font-black tracking-[0.2em] mb-6 flex items-center gap-3 text-xs">
                                                <Clock className="w-4 h-4" /> Queue Order
                                            </h4>
                                            <div className="space-y-4">
                                                {zone.waiting.length > 0 ? zone.waiting.map(t => (
                                                    <div key={t.id} className="flex justify-between items-center group/item">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-2 h-2 rounded-full ${t.isPriority ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-slate-700'}`}></div>
                                                            <span className="text-slate-500 font-bold tabular-nums text-lg">{t.tokenNumber}</span>
                                                        </div>
                                                        <span className={`font-black tracking-tight text-xl ${t.isPriority ? 'text-rose-400' : 'text-slate-200'}`}>
                                                            {t.customerName ? t.customerName.split(' ')[0] : 'Patient'}
                                                        </span>
                                                    </div>
                                                )) : (
                                                    <div className="text-center text-slate-700 py-10 font-black tracking-widest text-xs uppercase italic">No Patients Pending</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-indigo-400 opacity-20">
                            <Activity className="w-48 h-48 mb-10 animate-pulse" />
                            <h2 className="text-4xl font-black tracking-[0.5em] uppercase">Service Mesh Pending</h2>
                        </div>
                    )}
                </div>

                {/* INFOTAINMENT & STATS */}
                <aside className="w-[450px] flex-shrink-0 bg-slate-950/40 backdrop-blur-3xl border-l border-white/5 flex flex-col p-10 gap-10">
                    {/* Live Clock Card */}
                    <div className="p-10 rounded-[3rem] bg-indigo-600/10 border border-indigo-500/20 text-center relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[50px] -z-10 group-hover:scale-150 transition-transform duration-1000"></div>
                        <LiveClock />
                    </div>

                    {/* Performance Metrics */}
                    <div className="grid grid-cols-2 gap-6">
                        <StatCard label="In-Queue" value={tokens.filter(t => t.status === 'WAITING').length} color="text-indigo-400" />
                        <StatCard label="Completed" value={tokens.filter(t => t.status === 'SERVED').length} color="text-emerald-400" />
                    </div>

                    {/* Infotainment Carousel */}
                    <div className="flex-1 rounded-[3rem] bg-white/[0.02] border border-white/5 p-10 flex flex-col items-center justify-center text-center relative">
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Patient Education
                        </div>
                        <InfoCarousel />
                    </div>
                </aside>
            </div>

            {/* Global Footer Ribbon */}
            <footer className="p-6 bg-slate-950 border-t border-white/5 text-center flex justify-between items-center px-12">
                <div className="text-xs font-bold tracking-[0.2em] text-slate-600 uppercase">Mission-Critical Hospital Infrastructure</div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-indigo-500/50 text-[10px] font-black uppercase tracking-widest">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div> End-to-End Encrypted Sync
                    </div>
                    <span className="text-xs font-black text-white/20">v2.0.26</span>
                </div>
            </footer>
        </div>
    );
}

function LiveClock() {
    const [time, setTime] = useState('');
    const [date, setDate] = useState('');
    useEffect(() => {
        const update = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
            setDate(now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }));
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <div>
            <div className="text-7xl font-black tracking-tighter text-white tabular-nums mb-2">{time}</div>
            <div className="text-indigo-400 text-sm font-black uppercase tracking-[0.3em]">{date}</div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string, value: number, color: string }) {
    return (
        <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5 text-center">
            <div className={`text-6xl font-black tracking-tighter mb-2 tabular-nums ${color}`}>{value}</div>
            <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{label}</div>
        </div>
    );
}

const TIPS = [
    { icon: '🩺', title: 'Regular Screenings', body: 'Annual check-ups are the first line of defense against chronic conditions.' },
    { icon: '💧', title: 'Hydration IQ', body: 'Drinking water improves cognitive focus and renal function in the clinical environment.' },
    { icon: '🧘', title: 'Mental Wellness', body: '5 minutes of clinical mindfulness reduces elevated cortisol levels effectively.' },
    { icon: '🥗', title: 'Nutrition First', body: 'Focus on high-fiber, low-sodium diets for optimal cardiovascular performance.' },
];

function InfoCarousel() {
    const [idx, setIdx] = useState(0);
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const interval = setInterval(() => {
            setVisible(false);
            setTimeout(() => {
                setIdx(prev => (prev + 1) % TIPS.length);
                setVisible(true);
            }, 800);
        }, 12000);
        return () => clearInterval(interval);
    }, []);
    const tip = TIPS[idx];
    return (
        <div className={`transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-8 blur-lg'}`}>
            <div className="text-[7rem] mb-10 drop-shadow-2xl">{tip.icon}</div>
            <h3 className="text-3xl font-black text-white mb-6 tracking-tight">{tip.title}</h3>
            <p className="text-slate-400 text-xl font-medium leading-relaxed max-w-sm mx-auto">{tip.body}</p>
        </div>
    );
}

