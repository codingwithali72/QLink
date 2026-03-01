import { Button } from "@/components/ui/button";
import { XCircle, Phone, Smartphone, UserCheck } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";
import { motion } from "framer-motion";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    onToggleArrived?: (id: string, isArrived: boolean) => void;
    isCallLoading?: boolean;
    doctorName?: string;
}

export const TokenItem = memo(function TokenItem({ token, onCancel, onToggleArrived, isCallLoading, doctorName }: TokenItemProps) {
    const isLate = token.status === 'WAITING_LATE';
    const isRemote = token.source === 'DIRECT_WA' || token.source === 'WEB_LINK';
    const isArrived = token.isArrived;
    const needsArrival = isRemote && !isArrived;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "p-4 rounded-2xl flex items-center justify-between transition-all duration-300 relative border bg-white dark:bg-slate-900",
                isArrived ? "border-emerald-100 dark:border-emerald-900/30" : "border-slate-100 dark:border-white/5",
                token.isPriority && "border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20",
                isLate && "border-amber-200 dark:border-amber-900/40"
            )}
        >
            <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 transition-transform group-hover:scale-105",
                    token.isPriority
                        ? "bg-rose-500 text-white"
                        : isArrived
                            ? "bg-emerald-500 text-white"
                            : "bg-indigo-600 text-white"
                )}>
                    {token.tokenNumber}
                </div>

                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {token.customerName}
                        </span>
                        {token.isPriority && (
                            <div className="bg-rose-100 text-rose-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Emergency</div>
                        )}
                        {isLate && (
                            <div className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Follow-up Req</div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                            <Smartphone className="w-3 h-3" />
                            {token.customerPhone}
                        </div>
                        {isRemote && (
                            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">Remote</span>
                        )}
                        {doctorName && (
                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-tighter border-l border-slate-100 dark:border-slate-800 pl-3">
                                Dr. {doctorName.split(' ')[0]}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
                {needsArrival && onToggleArrived && (
                    <Button
                        variant="default"
                        size="sm"
                        disabled={isCallLoading}
                        onClick={() => onToggleArrived(token.id, true)}
                        className="h-9 px-4 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all active:scale-95"
                    >
                        <UserCheck className="w-3.5 h-3.5 mr-2" /> Check-in
                    </Button>
                )}

                <div className="flex items-center gap-1">
                    {token.customerPhone && (
                        <a href={`tel:${token.customerPhone}`}>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
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
                        className="h-9 w-9 text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                    >
                        <XCircle className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </motion.div>
    );
});
