"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, Clock, IndianRupee } from "lucide-react";

export function ROICalculator() {
    const [patientsPerDay, setPatientsPerDay] = useState(50);
    const [avgWaitTime, setAvgWaitTime] = useState(45);
    const [staffCount, setStaffCount] = useState(3);

    const metrics = useMemo(() => {
        const dailyWaitReduction = patientsPerDay * (avgWaitTime * 0.4);
        const monthlyHoursSaved = (dailyWaitReduction * 26) / 60;
        const staffEfficiencyGain = staffCount * 0.15;
        const monthlyStaffSavings = staffCount * 15000 * 0.15;
        const totalMonthlyValue = monthlyStaffSavings + (monthlyHoursSaved * 100);

        return {
            hoursSaved: Math.round(monthlyHoursSaved),
            monetaryImpact: Math.round(totalMonthlyValue),
            efficiency: Math.round(staffEfficiencyGain * 100)
        };
    }, [patientsPerDay, avgWaitTime, staffCount]);

    return (
        <Card className="p-8 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[60px] -z-10 group-hover:scale-150 transition-transform duration-1000"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-10">
                    <div>
                        <div className="flex justify-between mb-4">
                            <label className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Users className="w-4 h-4" /> Patients Per Day
                            </label>
                            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{patientsPerDay}</span>
                        </div>
                        <input
                            type="range"
                            min="10"
                            max="500"
                            step="10"
                            value={patientsPerDay}
                            onChange={(e) => setPatientsPerDay(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between mb-4">
                            <label className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Avg Physical Wait (Mins)
                            </label>
                            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{avgWaitTime}m</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="120"
                            step="5"
                            value={avgWaitTime}
                            onChange={(e) => setAvgWaitTime(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between mb-4">
                            <label className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Users className="w-4 h-4" /> Front-desk Staff
                            </label>
                            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{staffCount}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={staffCount}
                            onChange={(e) => setStaffCount(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                    <div className="space-y-6">
                        <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-800 pb-4">
                            <span className="font-bold text-slate-500 text-sm">Monthly Patient Time Saved</span>
                            <span className="text-3xl font-black text-slate-900 dark:text-white flex items-baseline gap-1">
                                {metrics.hoursSaved} <span className="text-xs font-bold text-slate-400">HRS</span>
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-800 pb-4">
                            <span className="font-bold text-slate-500 text-sm">Staff Efficiency Gain</span>
                            <span className="text-3xl font-black text-emerald-500">+{metrics.efficiency}%</span>
                        </div>
                        <div className="flex justify-between items-center pt-4">
                            <div className="space-y-1">
                                <span className="text-xs font-black uppercase tracking-widest text-indigo-500">Estimated Value</span>
                                <p className="text-slate-400 text-[10px] leading-tight">Total operational value reclaimed / mo</p>
                            </div>
                            <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                <IndianRupee className="w-6 h-6" />{metrics.monetaryImpact.toLocaleString('en-IN')}
                            </span>
                        </div>
                    </div>

                    <div className="mt-8 p-4 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-start gap-3">
                        <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
                        <p className="text-xs text-indigo-900 dark:text-indigo-300 font-bold leading-relaxed italic">
                            *Calculations based on 50% physical wait time reduction and standardized OPD efficiency benchmarks.
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
