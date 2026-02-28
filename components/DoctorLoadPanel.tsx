import { useMemo } from "react";
import { Doctor, Token } from "@/types/firestore";
import { Users, UserCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoctorLoadPanelProps {
    doctors: Doctor[];
    tokens: Token[];
    className?: string;
}

export function DoctorLoadPanel({ doctors, tokens, className }: DoctorLoadPanelProps) {
    const statsByDoctor = useMemo(() => {
        return doctors.map(doc => {
            const docTokens = tokens.filter(t => t.doctorId === doc.id);
            const waiting = docTokens.filter(t => t.status === 'WAITING' || t.status === 'WAITING_LATE').length;
            const serving = docTokens.filter(t => t.status === 'SERVING').length;

            // Utilization Index (UI) scale: more waiting = more load
            const ui = waiting;

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
        <div className={cn("mb-6 space-y-3", className)}>
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" />
                    Load Monitoring
                </h3>
                <span className="text-[9px] bg-white/50 dark:bg-slate-800/50 px-2 py-0.5 rounded-full text-slate-400 font-bold border border-white/20">
                    REAL-TIME HEATMAP
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 transition-all duration-500">
                {statsByDoctor.map((doc) => (
                    <div
                        key={doc.id}
                        className={cn(
                            "relative group bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-3 border transition-all duration-300 hover:shadow-xl",
                            doc.borderColor,
                            doc.glowColor
                        )}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="min-w-0">
                                <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {doc.name.replace("Dr. ", "Dr.")}
                                </h4>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter truncate opacity-70">
                                    {doc.specialization}
                                </p>
                            </div>
                            <div className={`w-1.5 h-1.5 rounded-full ${doc.statusColor} shadow-lg shrink-0 mt-1`} />
                        </div>

                        <div className="flex items-center gap-3 text-[10px]">
                            <div className="flex items-center gap-1.5">
                                <Users className="w-3 h-3 text-slate-400" />
                                <span className="font-black text-slate-700 dark:text-slate-300">
                                    {doc.waiting}
                                </span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">Wait</span>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3">
                                <UserCheck className="w-3 h-3 text-blue-500" />
                                <span className="font-black text-blue-600 dark:text-blue-400">
                                    {doc.serving}
                                </span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">In</span>
                            </div>
                        </div>

                        {/* Utilization Bar */}
                        <div className="mt-3 h-1 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
                            <div
                                className={cn("h-full transition-all duration-1000", doc.statusColor.split(' ')[0])}
                                style={{ width: `${Math.min((doc.ui / 10) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
