import { Button } from "@/components/ui/button";
import { XCircle, Phone } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Token } from "@/types/firestore";

interface TokenItemProps {
    token: Token;
    onCancel: (id: string) => void;
    // Per-token call loading — only THIS token's Call button shows a spinner,
    // not a global flag that would freeze NEXT/SKIP/ADD.
    isCallLoading?: boolean;
}

const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export const TokenItem = memo(function TokenItem({ token, onCancel }: TokenItemProps) {
    return (
        <div className={cn(
            "p-4 rounded-2xl flex items-center justify-between group transition-all duration-300 border",
            token.isPriority
                ? "bg-rose-500/[0.03] dark:bg-rose-500/[0.05] border-rose-500/20 hover:border-rose-500/40"
                : "bg-card/50 dark:bg-secondary/20 border-border/40 hover:border-primary/40 hover:bg-secondary/30 shadow-soft hover:shadow-medium"
        )}>
            <div className="flex items-center gap-4">
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs shadow-sm transition-transform group-hover:scale-105",
                    token.isPriority
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10"
                        : "bg-background text-foreground border border-border/60"
                )}>
                    {formatToken(token.tokenNumber, token.isPriority)}
                </div>
                <div>
                    <p className="font-black text-sm text-foreground tracking-tight truncate max-w-[130px] group-hover:text-primary transition-colors">
                        {token.customerName || 'Anonymous'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        {token.isPriority && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-md">Priority</span>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 font-medium font-mono">
                            {token.customerPhone}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                {token.customerPhone && (
                    <a href={`tel:${token.customerPhone}`}>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-10 px-4 rounded-xl text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-white transition-all active:scale-95"
                        >
                            <Phone className="w-3.5 h-3.5 mr-2" /> Call
                        </Button>
                    </a>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onCancel(token.id)}
                    className="h-10 w-10 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
                >
                    <XCircle className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
});
