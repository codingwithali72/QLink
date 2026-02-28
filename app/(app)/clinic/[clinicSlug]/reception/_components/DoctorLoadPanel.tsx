"use client";

import { useMemo } from "react";
import { Doctor, Token } from "@/types/firestore";
import { Users, UserCheck, Activity, AlertCircle, Clock, Loader2, PlayCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DoctorLoadPanelProps {
    doctors: Doctor[];
    tokens: Token[];
    onNextDoctor?: (doctorId: string) => void;
    isActionLoading?: boolean;
    className?: string;
}

export function DoctorLoadPanel({ doctors, tokens, onNextDoctor, isActionLoading, className }: DoctorLoadPanelProps) {
    const statsByDoctor = useMemo(() => {
        return doctors.map(doc => {
            const docTokens = tokens.filter(t => t.doctorId === doc.id);
            const waiting = docTokens.filter(t => t.status === 'WAITING' || t.status === 'WAITING_LATE').length;
            const serving = docTokens.filter(t => t.status === 'SERVING').length;

            /**
             * Utilization Index (UI) Calculation:
             * Multiplier Effect: (Waiting Patients * Avg Consultation) / Concurrent Doctors
             * For this panel, we assume 15m avg consultation.
             * Score 0-10: 0 (Idle), 5 (Optimal), 8+ (Bottleneck), 10 (Critical)
             */
            const avgConsultationMinutes = 15;
            const totalWorkloadMinutes = waiting * avgConsultationMinutes;
            const ui = Math.min(Math.max((totalWorkloadMinutes / 90) * 10, 0), 10); // 90 min (6 patients) = Score 10

            let statusColor = "bg-emerald-500";
            let textColor = "text-emerald-600 dark:text-emerald-400";
            let borderColor = "border-emerald-500/20";
            let glowColor = "shadow-emerald-500/10";
            let statusLabel = "Optimal Flow";

            if (ui >= 8) {
                statusColor = "bg-red-600 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.5)]";
                textColor = "text-red-700 dark:text-red-400 font-black";
                borderColor = "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse";
                glowColor = "shadow-red-500/60";
                statusLabel = "Critical Bottleneck";
            } else if (ui >= 5) {
                statusColor = "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]";
                textColor = "text-amber-600 dark:text-amber-400";
                borderColor = "border-amber-500/30";
                glowColor = "shadow-amber-500/20";
                statusLabel = "High Load";
            }

            return {
                ...doc,
                waiting,
                serving,
                ui,
                statusColor,
                textColor,
                borderColor,
                glowColor,
                statusLabel
            };
        });
    }, [doctors, tokens]);

    if (doctors.length === 0) return null;

    return (
        <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        OPD Heatmap & Resource Utilization
                    </h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-6">Mission-Critical Monitoring Layer</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-3 py-1 rounded-full shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[9px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                            Live Sync
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <AnimatePresence mode="popLayout">
                    {statsByDoctor.map((doc) => (
                        <motion.div
                            key={doc.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={cn(
                                "relative group overflow-hidden rounded-[1.5rem] bg-white dark:bg-slate-900 border p-4 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5",
                                doc.borderColor,
                                doc.ui >= 8 ? "dark:bg-red-950/10" : "hover:-translate-y-1"
                            )}
                        >
                            {/* Heatmap Background Glow */}
                            <div className={cn(
                                "absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-20 transition-opacity group-hover:opacity-40",
                                doc.statusColor
                            )} />

                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-black text-sm text-slate-900 dark:text-white truncate tracking-tight">
                                            DR. {doc.name.toUpperCase()}
                                        </h4>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.1em] truncate">
                                        {doc.specialization || "General OPD"}
                                    </p>
                                </div>
                                <div className={cn(
                                    "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
                                    doc.ui >= 8 ? "bg-red-500 text-white border-red-600 shadow-[0_0_12px_rgba(239,68,68,0.4)]" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                )}>
                                    UI: {doc.ui.toFixed(1)}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-5 relative z-10">
                                <div className="bg-slate-50 dark:bg-slate-950/40 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800/50">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        <Users className="w-2.5 h-2.5" /> Waiting
                                    </p>
                                    <p className="text-xl font-black text-slate-900 dark:text-white leading-none tabular-nums">
                                        {doc.waiting}
                                    </p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-950/40 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800/50">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        <UserCheck className="w-2.5 h-2.5 text-indigo-500" /> Serving
                                    </p>
                                    <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none tabular-nums">
                                        {doc.serving}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 relative z-10">
                                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                    <span className={doc.textColor}>{doc.statusLabel}</span>
                                    <span className="text-slate-400 flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />
                                        Est. {doc.waiting * 15}m wait
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min((doc.ui / 10) * 100, 100)}%` }}
                                        className={cn("h-full transition-colors duration-500", doc.statusColor)}
                                    />
                                </div>
                            </div>

                            {doc.ui >= 8 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-3 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[8px] font-black text-red-500 uppercase tracking-widest"
                                >
                                    <AlertCircle className="w-3 h-3" />
                                    Action Required: Route Walk-ins Elsewhere
                                </motion.div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
