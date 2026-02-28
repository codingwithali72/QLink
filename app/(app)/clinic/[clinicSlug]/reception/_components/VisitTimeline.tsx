"use client";

import { useEffect, useState } from "react";
import { getVisitTimeline, AuditEvent } from "@/app/actions/audit";
import { Loader2, ShieldCheck, Clock, UserPlus, CheckCircle, XCircle, AlertTriangle, UserMinus, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface VisitTimelineProps {
    visitId: string;
}

export function VisitTimeline({ visitId }: VisitTimelineProps) {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchTimeline = async () => {
            setLoading(true);
            const res = await getVisitTimeline(visitId);
            if (!isMounted) return;
            if (res.error) {
                setError(res.error);
            } else if (res.timeline) {
                setEvents(res.timeline);
            }
            setLoading(false);
        };
        fetchTimeline();
        return () => { isMounted = false; };
    }, [visitId]);

    if (loading) return <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
    if (error) return <div className="py-8 text-center text-red-500 text-sm font-bold">{error}</div>;
    if (events.length === 0) return <div className="py-8 text-center text-slate-500 text-sm">No audit logs found for this visit.</div>;

    const getIcon = (type: string) => {
        if (type.includes('START') || type.includes('CREATE')) return <UserPlus className="w-4 h-4 text-blue-500" />;
        if (type.includes('ARRIVED') || type.includes('SERVED')) return <CheckCircle className="w-4 h-4 text-green-500" />;
        if (type.includes('CANCEL')) return <XCircle className="w-4 h-4 text-red-500" />;
        if (type.includes('SKIP')) return <UserMinus className="w-4 h-4 text-amber-500" />;
        if (type.includes('CALL')) return <AlertTriangle className="w-4 h-4 text-purple-500" />;
        return <FileText className="w-4 h-4 text-slate-400" />;
    };

    const getBg = (type: string) => {
        if (type.includes('START') || type.includes('CREATE')) return "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900";
        if (type.includes('ARRIVED') || type.includes('SERVED')) return "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900";
        if (type.includes('CANCEL')) return "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900";
        if (type.includes('SKIP')) return "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900";
        if (type.includes('CALL')) return "bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900";
        return "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700";
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <ShieldCheck className="w-5 h-5 text-emerald-500 hidden sm:block" />
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Immutable Audit Trail</h3>
                    <p className="text-[10px] text-slate-400">Cryptographically verifiable sequence of events</p>
                </div>
            </div>

            <div className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-3 md:ml-4 space-y-6 pb-4">
                {events.map((event, idx) => (
                    <div key={event.id} className="relative pl-6 md:pl-8 group animate-in slide-in-from-left-2" style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm group-hover:border-blue-400 transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-500" />
                        </div>

                        <div className={cn("p-3 rounded-xl border shadow-sm transition-all duration-300", getBg(event.action_type))}>
                            <div className="flex justify-between items-start gap-4 mb-2">
                                <div className="flex items-center gap-2">
                                    {getIcon(event.action_type)}
                                    <h4 className="font-bold text-xs sm:text-sm text-foreground uppercase tracking-tight">
                                        {event.action_type.replace(/_/g, ' ')}
                                    </h4>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono shrink-0">
                                    <Clock className="w-3 h-3" />
                                    {format(new Date(event.timestamp), "HH:mm:ss.SSS")}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500 font-medium">
                                <span className="bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded">Action by: {event.actor_id ? "Staff" : "System / Patient"}</span>
                                {event.actor_id && <span className="font-mono text-[9px] truncate max-w-[100px] opacity-50">{event.actor_id}</span>}
                            </div>

                            {Object.keys(event.metadata || {}).length > 0 && (
                                <div className="mt-2 bg-white/50 dark:bg-black/20 rounded p-2 overflow-x-auto text-[9px] font-mono text-slate-600 dark:text-slate-400">
                                    {JSON.stringify(event.metadata, null, 2)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-center text-[9px] text-slate-400 font-mono mt-4">- End of cryptographic journal -</div>
        </div>
    );
}
