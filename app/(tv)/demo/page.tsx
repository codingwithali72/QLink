"use client";

import { useEffect, useState } from "react";
import { Users, Clock, ArrowRight, ShieldCheck, Activity } from "lucide-react";

export default function TVDemoPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const demoTokens = [
        { number: "A-42", doctor: "Dr. Ali", dept: "Cardiology", status: "SERVING", cabin: "4" },
        { number: "B-12", doctor: "Dr. Sharma", dept: "OPD", status: "WAITING", time: "5 mins" },
        { number: "A-45", doctor: "Dr. Ali", dept: "Cardiology", status: "WAITING", time: "12 mins" },
        { number: "C-08", doctor: "Dr. Gupta", dept: "Dermatology", status: "WAITING", time: "18 mins" },
        { number: "B-15", doctor: "Dr. Sharma", dept: "OPD", status: "WAITING", time: "25 mins" },
    ];

    return (
        <div className="min-h-screen bg-[#020617] text-white p-8 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
            {/* Dynamic Background Elements */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-600/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

            {/* Header */}
            <div className="flex justify-between items-center mb-12 border-b border-white/5 pb-8 relative z-10">
                <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 border border-white/10 group">
                        <span className="text-4xl font-black italic tracking-tighter group-hover:scale-110 transition-transform">Q</span>
                    </div>
                    <div>
                        <h1 className="text-5xl font-black tracking-tighter uppercase leading-none mb-2">QLink Clinical Demo</h1>
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-widest rounded-full border border-emerald-500/30 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                Live Orchestration Active
                            </span>
                            <span className="text-slate-500 font-bold text-sm tracking-widest uppercase">Room 204 • Waiting Lounge</span>
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-6xl font-black tracking-tighter mb-1 tabular-nums">10:45 <span className="text-3xl text-slate-500">AM</span></div>
                    <div className="text-indigo-400 font-black uppercase tracking-[0.2em] text-xs">Sunday, March 01</div>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-8 relative z-10">
                {/* Left: Now Serving Hero */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="p-10 rounded-[3rem] bg-indigo-600 shadow-[0_0_80px_-20px_rgba(79,70,229,0.4)] border border-white/20 relative overflow-hidden group">
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none group-hover:bg-white/20 transition-colors"></div>

                        <div className="flex items-center gap-3 mb-8">
                            <Activity className="w-6 h-6 text-white animate-pulse" />
                            <span className="text-xs font-black tracking-[0.3em] uppercase opacity-80">Currently Serving</span>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[10rem] font-black leading-none tracking-tighter -ml-2 drop-shadow-2xl">A-42</div>
                            <div className="flex items-center gap-4">
                                <div className="w-2 h-16 bg-white/20 rounded-full"></div>
                                <div>
                                    <div className="text-4xl font-black tracking-tight mb-1">Dr. Ali</div>
                                    <div className="text-xl font-bold opacity-70 tracking-widest uppercase">Cabin 04 • Cardiology</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 pt-4">
                        <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 flex flex-col justify-between aspect-square">
                            <Users className="w-10 h-10 text-indigo-400 mb-4" />
                            <div>
                                <div className="text-5xl font-black mb-1">12</div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Waiting</div>
                            </div>
                        </div>
                        <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 flex flex-col justify-between aspect-square">
                            <Clock className="w-10 h-10 text-emerald-400 mb-4" />
                            <div>
                                <div className="text-5xl font-black mb-1">~14m</div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg. Wait Time</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: The Queue */}
                <div className="col-span-12 lg:col-span-7 bg-white/5 rounded-[3rem] border border-white/10 p-10 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-10">
                        <h2 className="text-3xl font-black tracking-tighter flex items-center gap-4">
                            Upcoming Queue
                            <span className="px-3 py-1 bg-white/10 rounded-lg text-sm font-bold text-slate-400">5 Patients Next</span>
                        </h2>
                        <div className="flex gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {demoTokens.slice(1).map((token, i) => (
                            <div key={i} className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                                <div className="flex items-center gap-8">
                                    <div className="text-5xl font-black tracking-tight w-32 group-hover:scale-105 transition-transform">{token.number}</div>
                                    <div>
                                        <div className="text-xl font-black mb-1">Dr. {token.doctor === "Dr. Ali" ? "Ali" : token.doctor.replace("Dr. ", "")}</div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{token.dept}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-indigo-400 tabular-nums">IN {token.time}</div>
                                    <div className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Est. Ready Time</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 p-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="w-6 h-6 text-indigo-400" />
                            <span className="text-sm font-bold text-indigo-200">Waiting room security active • GDPR/DPDP Compliant Data Masking</span>
                        </div>
                        <ArrowRight className="w-5 h-5 text-indigo-400 animate-bounce-x" />
                    </div>
                </div>
            </div>

            {/* Footer Branding */}
            <div className="fixed bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none opacity-40">
                <div className="text-xs font-black uppercase tracking-[0.5em] text-slate-500">Live TV Signage v4.0.2</div>
                <div className="text-xs font-black uppercase tracking-[0.5em] text-indigo-500">Powered by QLink Intelligence</div>
            </div>

            <style jsx global>{`
        @keyframes bounce-x {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(10px); }
        }
        .animate-bounce-x {
          animation: bounce-x 1s infinite;
        }
      `}</style>
        </div>
    );
}
