/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2, Clock, UserRound, Maximize, Activity, ShieldCheck } from "lucide-react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

const DEMO_DOCTORS = [
    { id: "doc1", name: "Ali", specialization: "Cardiology", department_id: "dept1" },
    { id: "doc2", name: "Sharma", specialization: "General OPD", department_id: "dept2" },
];

const DEMO_DEPARTMENTS = [
    { id: "dept1", name: "Cardiology" },
    { id: "dept2", name: "General OPD" },
];

const DEMO_TOKENS = [
    { id: "t1", tokenNumber: 101, isPriority: true, status: "SERVING", doctorId: "doc1", departmentId: "dept1", customerName: "Rajeev Mehta" },
    { id: "t2", tokenNumber: 204, isPriority: false, status: "SERVING", doctorId: "doc2", departmentId: "dept2", customerName: "Ananya Iyer" },
    { id: "t3", tokenNumber: 102, isPriority: false, status: "WAITING", doctorId: "doc1", departmentId: "dept1", customerName: "Vikram Shah" },
    { id: "t4", tokenNumber: 103, isPriority: false, status: "WAITING", doctorId: "doc1", departmentId: "dept1", customerName: "Saritha K." },
    { id: "t5", tokenNumber: 205, isPriority: true, status: "WAITING", doctorId: "doc2", departmentId: "dept2", customerName: "Zoya Khan" },
    { id: "t6", tokenNumber: 206, isPriority: false, status: "WAITING", doctorId: "doc2", departmentId: "dept2", customerName: "Karan W." },
    { id: "t7", tokenNumber: 104, isPriority: true, status: "WAITING", doctorId: "doc1", departmentId: "dept1", customerName: "Sameer D." },
    { id: "t8", tokenNumber: 207, isPriority: false, status: "WAITING", doctorId: "doc2", departmentId: "dept2", customerName: "Nisha P." },
];

export default function TVDemoPage() {
    const [mounted, setMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Force Dark Mode context for TV
    useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }, []);

    const zones = useMemo(() => {
        return DEMO_DOCTORS.map(doc => {
            const dept = DEMO_DEPARTMENTS.find(d => d.id === doc.department_id);
            const docTokens = DEMO_TOKENS.filter(t => t.doctorId === doc.id);
            const serving = docTokens.find(t => t.status === 'SERVING');
            const waiting = docTokens.filter(t => t.status === 'WAITING').sort((a, b) => a.tokenNumber - b.tokenNumber).slice(0, 5);

            return { id: doc.id, name: `Dr. ${doc.name}`, subtitle: dept?.name || 'Specialist', serving, waiting };
        });
    }, []);

    if (!mounted) return (
        <div className="h-screen bg-[#020617] flex flex-col items-center justify-center text-white font-sans">
            <Loader2 className="animate-spin text-indigo-500 w-24 h-24 mb-6 opacity-20" />
            <h1 className="text-xl font-black tracking-[0.5em] text-indigo-300 uppercase animate-pulse">Initialising Showcase</h1>
        </div>
    );

    return (
        <div className="h-screen w-screen bg-[#020617] text-white overflow-hidden flex flex-col font-sans selection:bg-indigo-500/30 relative">
            {/* Dynamic Background Glows */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
                <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[150px] rounded-full"></div>
                <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-emerald-600/10 blur-[150px] rounded-full"></div>
            </div>

            {/* Header */}
            <header className="p-10 flex justify-between items-center border-b border-white/5 bg-slate-950/20 backdrop-blur-md">
                <div className="flex items-center gap-8">
                    <div className="h-20 w-20 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] flex items-center justify-center font-black text-5xl shadow-2xl shadow-indigo-600/40 border border-white/10">
                        Q
                    </div>
                    <div>
                        <h1 className="text-5xl font-black tracking-tighter text-white leading-none mb-2 uppercase tracking-tighter truncate max-w-[500px]">QLINK PREMIER CLINIC</h1>
                        <div className="flex items-center gap-4">
                            <span className="text-indigo-400 font-bold tracking-[0.2em] uppercase text-sm">Live Orchestration Dashboard</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                            <span className="text-slate-500 font-bold text-sm tabular-nums tracking-widest">
                                {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="px-8 py-3 rounded-full border border-white/10 bg-white/5 backdrop-blur-3xl flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse" />
                        <span className="text-2xl font-black tracking-tighter uppercase tabular-nums">OPEN</span>
                    </div>
                    <button onClick={toggleFullscreen} className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-slate-400">
                        <Maximize className="w-6 h-6" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-10 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-10 h-full">
                        {zones.map(zone => (
                            <div key={zone.id} className="relative group rounded-[3rem] bg-white/[0.03] border border-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-700 hover:border-indigo-500/30">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
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
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                        <Activity className="w-3 h-3 animate-pulse" /> Active Session
                                    </div>
                                </div>
                                <div className="flex-1 p-10 pt-4 flex flex-col xl:flex-row gap-10 items-center">
                                    <div className="flex-1 text-center w-full">
                                        <div className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs mb-6">Currently Serving</div>
                                        {zone.serving ? (
                                            <div>
                                                <h3 className="text-[12rem] xl:text-[14rem] leading-none font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                                    {formatToken(zone.serving.tokenNumber, zone.serving.isPriority)}
                                                </h3>
                                                <div className="text-4xl font-bold text-indigo-300 mt-6 tracking-tight truncate px-4">{zone.serving.customerName}</div>
                                            </div>
                                        ) : (
                                            <div className="opacity-10 py-10">
                                                <div className="text-[10rem] xl:text-[12rem] leading-none font-black italic">--</div>
                                                <p className="text-2xl mt-4 tracking-[0.5em] uppercase font-black">IDLE</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-full xl:w-[320px] bg-black/40 rounded-[2.5rem] p-8 border border-white/5 flex flex-col">
                                        <h4 className="text-indigo-400 uppercase font-black tracking-[0.2em] mb-6 flex items-center gap-3 text-xs">
                                            <Clock className="w-4 h-4" /> Queue Order
                                        </h4>
                                        <div className="space-y-4">
                                            {zone.waiting.map(t => (
                                                <div key={t.id} className="flex justify-between items-center">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-2 h-2 rounded-full ${t.isPriority ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-slate-700'}`}></div>
                                                        <span className="text-slate-500 font-bold tabular-nums text-lg">{formatToken(t.tokenNumber, t.isPriority)}</span>
                                                    </div>
                                                    <span className={`font-black tracking-tight text-xl ${t.isPriority ? 'text-rose-400' : 'text-slate-200'}`}>{t.customerName.split(' ')[0]}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <aside className="w-[450px] flex-shrink-0 bg-slate-950/40 backdrop-blur-3xl border-l border-white/5 flex flex-col p-10 gap-10">
                    <div className="p-10 rounded-[3rem] bg-indigo-600/10 border border-indigo-500/20 text-center relative overflow-hidden">
                        <div className="text-7xl font-black tracking-tighter text-white tabular-nums mb-2">
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </div>
                        <div className="text-indigo-400 text-sm font-black uppercase tracking-[0.3em]">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5 text-center">
                            <div className="text-6xl font-black tracking-tighter mb-2 tabular-nums text-indigo-400">12</div>
                            <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">In-Queue</div>
                        </div>
                        <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5 text-center">
                            <div className="text-6xl font-black tracking-tighter mb-2 tabular-nums text-emerald-400">48</div>
                            <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Served</div>
                        </div>
                    </div>
                    <div className="flex-1 rounded-[3rem] bg-indigo-500/5 group p-10 flex flex-col items-center justify-center text-center relative border border-indigo-500/10">
                        <div className="text-[8rem] mb-10 drop-shadow-2xl grayscale group-hover:grayscale-0 transition-all duration-700">🩺</div>
                        <h3 className="text-3xl font-black text-white mb-6">Patient Education</h3>
                        <p className="text-slate-400 text-xl font-medium leading-relaxed">Early detection saves lives. Book your annual screening today via WhatsApp.</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col gap-4 text-left">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="w-6 h-6 text-indigo-400" />
                            <span className="text-sm font-black text-indigo-200 uppercase tracking-widest leading-none">Security Active</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 leading-relaxed">QLINK Orchestration Engine v4.0. Operational Telemetry is fully encrypted and DPDP compliant.</p>
                    </div>
                </aside>
            </div>
            <footer className="p-6 bg-slate-950 border-t border-white/5 text-center px-12 flex justify-between items-center text-xs font-bold tracking-widest text-slate-500 uppercase">
                <span>Mission-Critical Hospital Infrastructure</span>
                <span>v2.0.26 Digital Signage Interface</span>
            </footer>
        </div>
    );
}
