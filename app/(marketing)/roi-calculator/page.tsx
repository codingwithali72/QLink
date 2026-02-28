/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TrendingDown, Clock, Pocket } from "lucide-react";

export default function RoiCalculatorPage() {
    const [volume, setVolume] = useState(120);
    const [waitTime, setWaitTime] = useState(45);

    // Dynamic calculations
    const walkouts = Math.round((volume * 0.15) * (waitTime / 60));
    const hoursClaimed = Math.round((volume * 0.1) * 7); // staff hours
    const annualRoi = (volume * 150 * 0.12 * 365).toLocaleString("en-IN", { maximumFractionDigits: 0 });

    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-5xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Business Value Modeling
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Calculate Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-electric-cyan">Operational ROI.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
                    See exactly how much revenue leakage you can prevent and how much staff time you can reclaim by moving to a virtual queue.
                </p>
            </section>

            {/* Calculator Interface */}
            <section className="pb-32 max-w-5xl mx-auto px-6">
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-12 border border-slate-200 dark:border-slate-800 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-16">
                    <div className="space-y-12">
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest">Daily Patient Volume</label>
                                <span className="text-2xl font-black text-indigo-600">{volume}</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="500"
                                value={volume}
                                onChange={(e) => setVolume(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-xs font-bold text-slate-400 mt-2"><span>10</span><span>500+</span></div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest">Average Wait Time (mins)</label>
                                <span className="text-2xl font-black text-indigo-600">{waitTime} mins</span>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="180"
                                value={waitTime}
                                onChange={(e) => setWaitTime(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-xs font-bold text-slate-400 mt-2"><span>5 min</span><span>3 hrs</span></div>
                        </div>
                        <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30">
                            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 italic">"The average hospital loses 15% of daily walk-ins due to lobby congestion wait-times."</p>
                        </div>
                    </div>
                    <div className="flex flex-col justify-center space-y-8">
                        <ResultRow icon={<TrendingDown className="text-red-500" />} label="Est. Avoided Walk-outs" value={`${walkouts} / day`} />
                        <ResultRow icon={<Clock className="text-electric-cyan" />} label="Staff Hours Reclaimed" value={`${hoursClaimed} hrs/wk`} />
                        <ResultRow icon={<Pocket className="text-emerald-500" />} label="Est. Annual Profit Lift" value={`₹${annualRoi}`} />
                        <Button className="h-16 rounded-2xl bg-[#0B1120] hover:bg-slate-800 text-white font-black text-lg shadow-xl shadow-indigo-600/10">Get Full Audit Report</Button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function ResultRow({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
    return (
        <div className="flex items-center gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center shadow-inner">{icon}</div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{value}</p>
            </div>
        </div>
    );
}
