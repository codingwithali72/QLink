import { Button } from "@/components/ui/button";
import { XCircle, Phone, UserCheck, Smartphone, ActivitySquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";
import { motion } from "framer-motion";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    onToggleArrived?: (id: string, isArrived: boolean) => void;
    isCallLoading?: boolean;
    departmentName?: string;
    doctorName?: string;
}

export const TokenItem = memo(function TokenItem({ token, onCancel, onToggleArrived, isCallLoading, departmentName, doctorName }: TokenItemProps) {
    const isLate = token.status === 'WAITING_LATE';
    const isRemote = token.source === 'DIRECT_WA' || token.source === 'WEB_LINK';
    const isArrived = token.isArrived;
    const needsArrival = isRemote && !isArrived;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                "p-5 rounded-[2.5rem] flex items-center justify-between group transition-all duration-500 relative border-2 overflow-hidden bg-white dark:bg-slate-900 shadow-xl hover:shadow-2xl",
                isArrived && "border-l-[12px] border-l-emerald-500",
                token.isPriority && "border-rose-500/30 bg-rose-500/[0.02] shadow-rose-500/5",
                isLate && "animate-pulse-amber border-amber-500/50",
                !isArrived && !token.isPriority && !isLate && "border-slate-100 dark:border-white/5 hover:border-indigo-500/40"
            )}
        >
            <div className="flex items-center gap-6 w-1/2 relative z-10">
                <div className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex flex-col shrink-0 items-center justify-center font-black transition-all group-hover:rotate-3 group-hover:scale-110 shadow-2xl",
                    token.isPriority
                        ? "bg-rose-500 text-white shadow-rose-500/40"
                        : isArrived
                            ? "bg-emerald-500 text-white shadow-emerald-500/40"
                            : "bg-slate-950 text-white shadow-slate-950/20"
                )}>
                    <span className="text-[9px] opacity-60 uppercase mb-0.5 tracking-widest">{token.isPriority ? 'VVIP' : 'UNIT'}</span>
                    <span className="text-2xl leading-none tracking-tighter">{token.tokenNumber}</span>
                </div>

                <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <p className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tighter group-hover:translate-x-1 transition-transform">
                            {token.customerName.toUpperCase()}
                        </p>
                        {isArrived && (
                            <Badge className="bg-emerald-500 text-white border-0 text-[8px] font-black p-0.5 px-2 rounded-lg shadow-lg shadow-emerald-500/20">ARRIVED</Badge>
                        )}
                        {isLate && (
                            <Badge className="bg-amber-500 text-white border-0 text-[8px] font-black p-0.5 px-2 rounded-lg animate-pulse">ACTION REQ</Badge>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <div className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 opacity-50" />
                            {token.customerPhone}
                        </div>
                        {isRemote && <span className="text-[8px] px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded-lg">REMOTE BOOKING</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[9px] font-black uppercase tracking-[0.2em]">
                        {doctorName ? (
                            <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 shadow-sm">
                                <ActivitySquare className="w-3 h-3" /> DR. {doctorName.toUpperCase()}
                            </span>
                        ) : (
                            <span className="text-slate-400">GENERIC ROUTING</span>
                        )}
                        {departmentName && <span className="text-slate-400 opacity-50 border-l border-slate-200 dark:border-white/10 pl-3">{departmentName}</span>}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 relative z-10">
                {needsArrival && onToggleArrived && (
                    <Button
                        variant="default"
                        size="sm"
                        disabled={isCallLoading}
                        onClick={() => onToggleArrived(token.id, true)}
                        className="h-11 px-6 text-[10px] font-black uppercase tracking-[0.2em] bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex gap-3 shadow-xl shadow-indigo-500/20 transition-all active:scale-95 border-b-4 border-indigo-800"
                    >
                        <UserCheck className="w-4 h-4" /> AUTHENTICATE ARRIVAL
                    </Button>
                )}

                <div className="flex items-center gap-2">
                    {token.customerPhone && (
                        <a href={`tel:${token.customerPhone}`}>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-11 px-4 rounded-2xl border-2 border-slate-100 dark:border-white/5 text-slate-500 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all font-black text-[10px]"
                            >
                                <Phone className="w-4 h-4" />
                            </Button>
                        </a>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={isCallLoading}
                        onClick={() => onCancel(token.id)}
                        className="h-11 w-11 text-slate-300 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all"
                    >
                        <XCircle className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/[0.01] pointer-events-none transition-colors" />
        </motion.div>
    );
});
