"use client";

import { useMemo } from "react";
import { Doctor, Token } from "@/types/firestore";
import { Users, UserCheck, Activity } from "lucide-react";
import { motion } from "framer-motion";

interface DoctorLoadPanelProps {
    doctors: Doctor[];
    tokens: Token[];
}

export function DoctorLoadPanel({ doctors, tokens }: DoctorLoadPanelProps) {
    const statsByDoctor = useMemo(() => {
        return doctors.map(doc => {
            const docTokens = tokens.filter(t => t.doctorId === doc.id);
            const waiting = docTokens.filter(t => t.status === 'WAITING' || t.status === 'WAITING_LATE').length;
            const serving = docTokens.filter(t => t.status === 'SERVING').length;

            // Utilization Index (UI) = Waiting / AvgTime (15 mins)
            // But per functionality.md, we want to visualize load.
            // Let's use a scale of 0-10 where 5 is moderate.
            const ui = waiting; // Simplification: more waiting = more load

            let statusColor = "bg-green-500";
            let borderColor = "border-green-500/20";
            let glowColor = "shadow-green-500/10";

            if (ui > 8) {
                statusColor = "bg-red-500 animate-pulse";
                borderColor = "border-red-500/50";
                glowColor = "shadow-red-500/40";
            } else if (ui > 4) {
                statusColor = "bg-amber-500";
                borderColor = "border-amber-500/30";
                glowColor = "shadow-amber-500/20";
            }

            return {
                ...doc,
                waiting,
                serving,
                ui,
                statusColor,
                borderColor,
                glowColor
            };
        });
    }, [doctors, tokens]);

    if (doctors.length === 0) return null;

    return (
        <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Doctor Load Intelligence
                </h3>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">
                    Real-time Heatmap
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {statsByDoctor.map((doc) => (
                    <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative group glass-card p-3 border ${doc.borderColor} ${doc.glowColor} transition-all hover:scale-[1.02]`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[120px]">
                                    {doc.name}
                                </h4>
                                <p className="text-[10px] text-slate-500 truncate">
                                    {doc.specialization || "OPD Specialist"}
                                </p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${doc.statusColor} shadow-lg`} />
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {doc.waiting}
                                </span>
                                <span className="text-[10px] text-slate-400 capitalize">Waiting</span>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 pl-4">
                                <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                    {doc.serving}
                                </span>
                                <span className="text-[10px] text-slate-400 capitalize">Serving</span>
                            </div>
                        </div>

                        {/* Utilization Bar */}
                        <div className="mt-3 h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((doc.ui / 10) * 100, 100)}%` }}
                                className={`h-full ${doc.statusColor}`}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
