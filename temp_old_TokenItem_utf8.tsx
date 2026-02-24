import { Button } from "@/components/ui/button";
import { XCircle, Phone } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    // Per-token call loading ΓÇö only THIS token's Call button shows a spinner,
    // not a global flag that would freeze NEXT/SKIP/ADD.
    isCallLoading?: boolean;
}

const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export const TokenItem = memo(function TokenItem({ token, onCancel }: TokenItemProps) {
    return (
        <div className={cn(
            "p-3 rounded-xl flex items-center justify-between group transition-colors",
            token.isPriority
                ? "bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30"
                : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
                    token.isPriority
                        ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-200"
                        : "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                )}>
                    {formatToken(token.tokenNumber, token.isPriority)}
                </div>
                <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-200 truncate max-w-[120px]">
                        {token.customerName}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {token.customerPhone}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    onClick={() => onCancel(token.id)}
                    className="h-8 w-8 text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-700 rounded-full"
                >
                    <XCircle className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
});
