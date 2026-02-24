import { Button } from "@/components/ui/button";
import { XCircle, Phone } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    isCallLoading?: boolean;
}

const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export const TokenItem = memo(function TokenItem({ token, onCancel }: TokenItemProps) {
    return (
        <div className={cn(
            "p-3 rounded-xl flex items-center justify-between group transition-colors border",
            token.isPriority
                ? "bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30"
                : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-100 dark:border-slate-800"
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm",
                    token.isPriority
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-200"
                        : "bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                )}>
                    {formatToken(token.tokenNumber, token.isPriority)}
                </div>
                <div>
                    <p className="font-bold text-sm text-foreground truncate max-w-[120px]">
                        {token.customerName || 'Anonymous'}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
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
                            className="h-8 text-[11px] font-bold text-primary border-primary/20 hover:bg-primary/10"
                        >
                            <Phone className="w-3 h-3 mr-1" /> Call
                        </Button>
                    </a>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCancel(token.id)}
                    className="h-8 w-8 text-muted-foreground/40 hover:text-rose-500 rounded-full"
                >
                    <XCircle className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
});
