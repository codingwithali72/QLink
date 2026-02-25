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
            "p-3 rounded-xl flex items-center justify-between group transition-colors",
            token.isPriority
                ? "bg-destructive/10 border border-destructive/20"
                : "bg-accent/50 hover:bg-accent border border-transparent"
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
                    token.isPriority
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-card text-card-foreground shadow-sm"
                )}>
                    {formatToken(token.tokenNumber, token.isPriority)}
                </div>
                <div>
                    <p className="font-bold text-sm text-foreground truncate max-w-[120px]">
                        {token.customerName}
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
