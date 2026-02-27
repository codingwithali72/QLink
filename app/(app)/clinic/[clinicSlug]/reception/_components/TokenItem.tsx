import { Button } from "@/components/ui/button";
import { XCircle, Phone, MapPinCheck, Clock } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    onToggleArrived?: (id: string, isArrived: boolean) => void;
    isCallLoading?: boolean;
    departmentName?: string;
    doctorName?: string;
}

const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export const TokenItem = memo(function TokenItem({ token, onCancel, onToggleArrived, isCallLoading, departmentName, doctorName }: TokenItemProps) {
    const isLate = token.status === 'WAITING_LATE';
    const isRemote = token.source === 'DIRECT_WA' || token.source === 'WEB_LINK';
    const needsArrival = isRemote && !token.isArrived;

    return (
        <div className={cn(
            "p-3 rounded-xl flex items-center justify-between group transition-all duration-300 relative",
            token.isPriority
                ? "bg-destructive/10 border border-destructive/20"
                : isLate
                    ? "bg-amber-100 border border-amber-300 animate-pulse dark:bg-amber-900/30 dark:border-amber-800"
                    : "bg-accent/50 hover:bg-accent border border-transparent"
        )}>
            {isLate && (
                <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm opacity-90 z-10">
                    <Clock className="w-2.5 h-2.5" /> Ghost Patient
                </div>
            )}

            <div className="flex items-center gap-3 w-1/2">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex shrink-0 items-center justify-center font-bold text-sm",
                    token.isPriority
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-card text-card-foreground shadow-sm"
                )}>
                    {formatToken(token.tokenNumber, token.isPriority)}
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-sm text-foreground truncate w-full">
                        {token.customerName}
                    </p>
                    <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                                {token.customerPhone}
                            </p>
                            {isRemote && (
                                <span className={cn(
                                    "text-[8px] font-bold px-1 rounded uppercase tracking-widest",
                                    token.isArrived ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                )}>
                                    Remote
                                </span>
                            )}
                        </div>
                        {(departmentName || doctorName) && (
                            <div className="flex items-center gap-1 mt-0.5">
                                {departmentName && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 leading-none">{departmentName}</span>}
                                {doctorName && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 leading-none">Dr. {doctorName}</span>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {needsArrival && onToggleArrived && (
                    <Button
                        variant="default"
                        size="sm"
                        disabled={isCallLoading}
                        onClick={() => onToggleArrived(token.id, true)}
                        className="h-8 text-[10px] font-bold bg-green-600 hover:bg-green-700 text-white flex gap-1 animate-in zoom-in-95 transition-all outline-none"
                    >
                        <MapPinCheck className="w-3 h-3" /> Arrive
                    </Button>
                )}

                <div className={cn("flex items-center gap-1 transition-all duration-300", needsArrival ? "opacity-0 group-hover:opacity-100 hidden md:flex" : "opacity-0 group-hover:opacity-100")}>
                    {token.customerPhone && (
                        <a href={`tel:${token.customerPhone}`}>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40"
                            >
                                <Phone className="w-3 h-3 mr-1" />Call
                            </Button>
                        </a>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={isCallLoading}
                        onClick={() => onCancel(token.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full shrink-0 transition-colors"
                    >
                        <XCircle className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
});
