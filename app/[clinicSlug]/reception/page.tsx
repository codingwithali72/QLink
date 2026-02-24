"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { nextPatient, skipToken, cancelToken, recallToken, pauseQueue, resumeQueue, createToken, closeQueue, startSession, getTokensForDate, undoLastAction, updateToken } from "@/app/actions/queue";
import { exportPatientList } from "@/app/actions/export";
import { isValidIndianPhone } from "@/lib/phone";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, SkipForward, PauseCircle, Users, AlertOctagon, LogOut, PlayCircle, Plus, RefreshCw, Moon, Sun, Calendar, Power, ChevronDown, ChevronUp, Search, RotateCcw, Pencil, AlertTriangle, BarChart2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { TokenItem } from "./_components/TokenItem";
import { getClinicDate } from "@/lib/date";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function ReceptionPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, loading, error, refresh, lastUpdated, isConnected, dailyTokenLimit, setTokens } = useClinicRealtime(params.clinicSlug);

    // ── Per-action loading flags ─────────────────────────────────────────────
    // Each action has its own flag so one in-flight request doesn't block others.
    const [nextLoading, setNextLoading] = useState(false);
    const [skipLoading, setSkipLoading] = useState(false);
    const [pauseLoading, setPauseLoading] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    // Legacy alias: true if any heavy action is running (used only for Add form submit)
    const actionLoading = nextLoading || skipLoading || pauseLoading || addLoading;
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const { theme, setTheme } = useTheme();
    const isDarkMode = theme === 'dark';

    // B1: Stalled queue detection — track how long since last NEXT
    const [servingChangedAt, setServingChangedAt] = useState<Date | null>(null);
    const [lastServingId, setLastServingId] = useState<string | null>(null);
    const [stallMinutes, setStallMinutes] = useState(0);

    // B4: Inline token edit
    const [editingToken, setEditingToken] = useState<{ id: string; name: string; phone: string } | null>(null);

    // Manual Token Form
    const [manualName, setManualName] = useState("");
    const [manualPhone, setManualPhone] = useState("");
    const [manualIsPriority, setManualIsPriority] = useState(false);

    // Queue Controls
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // History State
    interface Token {
        id: string;
        tokenNumber: number;
        isPriority: boolean;
        status: string;
        customerName?: string | null;
        customerPhone?: string | null;
        feedback?: string | null;
    }

    const todayStr = getClinicDate();
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [historyTokens, setHistoryTokens] = useState<Token[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Fetch History/Log Data
    useEffect(() => {
        if (!isLogOpen) return;

        async function fetchLog() {
            setHistoryLoading(true);
            const res = await getTokensForDate(params.clinicSlug, selectedDate);
            if (res.tokens) setHistoryTokens(res.tokens);
            setHistoryLoading(false);
        }
        fetchLog();
    }, [selectedDate, params.clinicSlug, isLogOpen, todayStr]);

    const displayedTokens = historyTokens;

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ── Generic action wrapper with optimistic UI support ───────────────────
    const performAction = useCallback(async (
        actionFn: () => Promise<{ error?: string;[key: string]: unknown }>,
        setLoading: (v: boolean) => void,
        optimisticUpdate?: () => void,
        rollback?: () => void
    ) => {
        setLoading(true);
        // Apply optimistic state immediately so UI feels instant
        if (optimisticUpdate) optimisticUpdate();
        try {
            const result = await actionFn();
            if (result && result.error) {
                // Roll back optimistic state if server rejected the action
                if (rollback) rollback();
                showToast(result.error, 'error');
            }
        } catch (e) {
            if (rollback) rollback();
            console.error(e);
            showToast("Unexpected Error", 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // MEMOIZED DERIVED STATE
    const waitingTokens = useMemo(() => {
        return tokens.filter(t => t.status === 'WAITING').sort((a, b) => {
            if (a.isPriority && !b.isPriority) return -1;
            if (!a.isPriority && b.isPriority) return 1;
            return a.tokenNumber - b.tokenNumber;
        });
    }, [tokens]);

    const visibleWaitingTokens = useMemo(() => waitingTokens.slice(0, 50), [waitingTokens]);

    const servingToken = useMemo(() => tokens.find(t => t.status === 'SERVING') || null, [tokens]);

    const skippedTokens = useMemo(() => {
        return tokens.filter(t => t.status === 'SKIPPED').sort((a, b) => a.tokenNumber - b.tokenNumber);
    }, [tokens]);

    const totalServedCount = useMemo(() => {
        if (selectedDate === todayStr) return tokens.filter(t => t.status === 'SERVED').length;
        return displayedTokens.filter(t => t.status === 'SERVED').length;
    }, [tokens, displayedTokens, selectedDate, todayStr]);

    const activeTokensCount = useMemo(() => {
        return tokens.filter(t => t.status !== 'SERVED' && t.status !== 'CANCELLED').length;
    }, [tokens]);

    const isLimitReached = dailyTokenLimit !== null && dailyTokenLimit > 0 && activeTokensCount >= dailyTokenLimit;

    // ── Action handlers ──────────────────────────────────────────────────────

    const handleNext = useCallback(() => {
        // Optimistic: mark current serving as SERVED, advance next WAITING to SERVING
        const snapshot = tokens; // capture for rollback
        performAction(
            () => nextPatient(params.clinicSlug),
            setNextLoading,
            () => {
                setTokens(prev => {
                    const next = [...prev];
                    const servingIdx = next.findIndex(t => t.status === 'SERVING');
                    if (servingIdx !== -1) next[servingIdx] = { ...next[servingIdx], status: 'SERVED' };
                    const waitingTokens = next
                        .filter(t => t.status === 'WAITING')
                        .sort((a, b) => {
                            if (a.isPriority && !b.isPriority) return -1;
                            if (!a.isPriority && b.isPriority) return 1;
                            return a.tokenNumber - b.tokenNumber;
                        });
                    if (waitingTokens.length > 0) {
                        const nextIdx = next.findIndex(t => t.id === waitingTokens[0].id);
                        if (nextIdx !== -1) next[nextIdx] = { ...next[nextIdx], status: 'SERVING' };
                    }
                    return next;
                });
            },
            () => setTokens(snapshot)
        );
    }, [tokens, params.clinicSlug, performAction, setTokens]);

    const handleSkip = useCallback(() => {
        if (!servingToken) return;
        const snapshot = tokens;
        performAction(
            () => skipToken(params.clinicSlug, servingToken.id),
            setSkipLoading,
            () => setTokens(prev => prev.map(t => t.id === servingToken.id ? { ...t, status: 'SKIPPED' } : t)),
            () => setTokens(snapshot)
        );
    }, [servingToken, tokens, params.clinicSlug, performAction, setTokens]);

    const handleEmergencyClick = () => {
        setManualIsPriority(true);
        setManualName("");
        setManualPhone("0000000000");
        setIsAddModalOpen(true);
    };
    const handleUndo = () => {
        if (confirm("Undo the last action?")) performAction(() => undoLastAction(params.clinicSlug), setNextLoading);
    };
    const handlePauseToggle = () => {
        if (!session) return;
        performAction(
            () => session.status === 'OPEN' ? pauseQueue(params.clinicSlug) : resumeQueue(params.clinicSlug),
            setPauseLoading
        );
    };
    const handleCloseQueue = () => {
        const answer = prompt('Type CLOSE to confirm ending today\'s queue:');
        if (answer?.trim().toUpperCase() === 'CLOSE') performAction(() => closeQueue(params.clinicSlug), setPauseLoading);
    };
    const handleStartSession = () => performAction(() => startSession(params.clinicSlug), setPauseLoading);

    const handleRecall = (id: string) => {
        if (!confirm("Recall this ticket?")) return;
        const snapshot = tokens;
        performAction(
            () => recallToken(params.clinicSlug, id),
            setNextLoading, // reuse nextLoading — recall is a queue-advance variant
            () => setTokens(prev => prev.map(t => t.id === id ? { ...t, status: 'WAITING', isPriority: true } : t)),
            () => setTokens(snapshot)
        );
    };

    const handleCancelToken = useCallback((id: string) => {
        const snapshot = tokens;
        performAction(
            () => cancelToken(params.clinicSlug, id),
            setSkipLoading,
            () => setTokens(prev => prev.map(t => t.id === id ? { ...t, status: 'CANCELLED' } : t)),
            () => setTokens(snapshot)
        );
    }, [tokens, params.clinicSlug, performAction, setTokens]);

    const handleManualAdd = async (e: React.FormEvent) => {
        e.preventDefault();

        // Prevent invalid phone inputs at UI level, but allow empty/fake for emergencies
        if (manualPhone.trim() !== "" && manualPhone !== "0000000000") {
            if (!isValidIndianPhone(manualPhone)) {
                alert("Please enter a valid 10-digit Indian mobile number");
                return;
            }
        } else if (!manualIsPriority) {
            alert("A valid mobile number is required for standard walk-ins");
            return;
        }

        setAddLoading(true);
        const res = await createToken(params.clinicSlug, manualPhone, manualName, manualIsPriority);
        if (res.error) {
            if (res.is_duplicate) {
                alert(`Token #${res.existing_token_number} already exists for this number in ${res.existing_status} state. Creation ignored.`);
                setIsAddModalOpen(false);
                setManualName("");
                setManualPhone("");
                setManualIsPriority(false);
            } else if (res.limit_reached) {
                alert(`Daily limit reached (${res.count}/${res.limit}).`);
                setIsAddModalOpen(false);
                setManualName("");
                setManualPhone("");
                setManualIsPriority(false);
            } else {
                alert(res.error);
            }
        } else {
            setIsAddModalOpen(false);
            setManualName("");
            setManualPhone("");
            setManualIsPriority(false);
            refresh();
        }
        setAddLoading(false);
    };

    // B1: Stall detection — track when serving token changes
    useEffect(() => {
        const currentId = servingToken?.id || null;
        if (currentId !== lastServingId) {
            setLastServingId(currentId);
            setServingChangedAt(currentId ? new Date() : null);
            setStallMinutes(0);
        }
    }, [servingToken?.id, lastServingId]);

    useEffect(() => {
        if (!servingChangedAt || session?.status !== 'OPEN') { setStallMinutes(0); return; }
        const interval = setInterval(() => {
            setStallMinutes(Math.floor((Date.now() - servingChangedAt.getTime()) / 60000));
        }, 30000); // check every 30s
        return () => clearInterval(interval);
    }, [servingChangedAt, session?.status]);

    // B4: Handle save edit
    const handleSaveEdit = async () => {
        if (!editingToken) return;

        if (editingToken.phone && editingToken.phone.trim() !== "") {
            if (!isValidIndianPhone(editingToken.phone)) {
                alert("Please enter a valid 10-digit Indian mobile number");
                return;
            }
        }

        setAddLoading(true);
        const res = await updateToken(params.clinicSlug, editingToken.id, editingToken.name, editingToken.phone);
        if (res.error) alert(res.error);
        else { setEditingToken(null); refresh(); }
        setAddLoading(false);
    };


    const [showOfflineError, setShowOfflineError] = useState(false);
    useEffect(() => {
        if (!isConnected && !loading) {
            const timer = setTimeout(() => setShowOfflineError(true), 3000);
            return () => clearTimeout(timer);
        } else {
            setShowOfflineError(false);
        }
    }, [isConnected, loading]);

    const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    if (loading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary/40 w-10 h-10" /></div>;

    if (error) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
                <div className="p-4 bg-rose-500/10 rounded-3xl mb-6 shadow-lg shadow-rose-500/5 transition-transform hover:scale-105 duration-300">
                    <AlertOctagon className="w-12 h-12 text-rose-500" />
                </div>
                <h2 className="text-2xl font-black text-foreground mb-3 tracking-tight">Terminal Error</h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-8 font-medium leading-relaxed">{error}</p>
                <div className="flex gap-3">
                    <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold border-border shadow-soft" onClick={() => window.location.reload()}>Reconnect Now</Button>
                    <Button variant="ghost" className="rounded-2xl h-12 font-bold" onClick={() => logout()}>Exit Terminal</Button>
                </div>
            </div>
        );
    }

    const isSessionActive = session?.status === 'OPEN' || session?.status === 'PAUSED';

    return (
        <div className="min-h-screen bg-background text-foreground font-sans transition-colors duration-300 relative overflow-hidden pb-20">
            {/* Background Aesthetics */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] -translate-x-1/4 translate-y-1/4 pointer-events-none" />

            {showOfflineError && (
                <div className="fixed top-0 left-0 w-full bg-rose-600 text-white text-[10px] py-1 font-black z-[100] animate-in slide-in-from-top-full tracking-widest text-center uppercase">
                    Critical: Lost connection to real-time engine...
                </div>
            )}

            {stallMinutes >= 5 && servingToken && session?.status === 'OPEN' && (
                <div className={cn(
                    "fixed top-4 left-1/2 -translate-x-1/2 z-[90] px-6 py-2.5 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4",
                    stallMinutes >= 10 ? 'bg-rose-600' : 'bg-amber-500'
                )}>
                    <AlertTriangle className="w-4 h-4" />
                    Queue Inactive for {stallMinutes} minutes
                </div>
            )}

            <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 relative z-10">
                {/* ── UNIFIED HEADER ── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 lg:mb-12">
                    <div className="flex items-center gap-5">
                        <div className="h-14 w-14 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-black text-2xl shadow-xl shadow-primary/20 transition-transform hover:scale-110 duration-500 rotate-2 group cursor-default">
                            Q
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground uppercase pt-1">Reception</h1>
                                <Badge variant="secondary" className="bg-secondary/80 text-foreground border-border font-black text-[9px] tracking-[0.1em] px-2 py-0.5 h-fit opacity-80 uppercase">{params.clinicSlug}</Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-2 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-secondary/50 rounded-lg border border-border/40">
                                    <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-500" : "bg-rose-500 animate-pulse")} />
                                    {isConnected ? 'Sync Active' : 'Offline'}
                                </div>
                                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-primary/60" /> {todayDate}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className={cn("px-4 py-2 rounded-2xl text-[10px] font-black tracking-[0.1em] border flex items-center gap-2.5 shadow-soft",
                            session?.status === 'OPEN' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" :
                                session?.status === 'PAUSED' ? "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" :
                                    "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400"
                        )}>
                            <div className={cn("w-2 h-2 rounded-full",
                                session?.status === 'OPEN' ? "bg-emerald-500 animate-pulse" : session?.status === 'PAUSED' ? "bg-amber-500" : "bg-rose-500"
                            )}></div>
                            {session?.status || "CLOSED"}
                        </div>

                        <div className="flex bg-card/50 backdrop-blur-md p-1.5 rounded-2xl border border-border/60 shadow-soft">
                            <Button variant="ghost" size="icon" onClick={() => setTheme(isDarkMode ? 'light' : 'dark')} className="h-9 w-9 rounded-xl text-muted-foreground transition-all hover:bg-secondary active:scale-90">
                                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            </Button>
                            <div className="w-px h-5 bg-border/60 mx-1" />
                            <Button variant="ghost" size="icon" onClick={() => logout()} className="h-9 w-9 rounded-xl text-muted-foreground transition-all hover:bg-rose-500/10 hover:text-rose-500 active:scale-90">
                                <LogOut className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </header>

                {/* MAIN GRID */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10">

                    {/* LEFT COLUMN: Controls & Status (8 cols) */}
                    <div className="xl:col-span-8 space-y-8 lg:space-y-10">

                        {/* HERO CARD: Now Serving */}
                        <Card className="relative overflow-hidden border-border/60 shadow-medium bg-card/50 backdrop-blur-2xl h-64 sm:h-80 flex flex-col items-center justify-center p-8 rounded-[2.5rem] group border-b-[6px] border-b-primary/40">
                            <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-700 pointer-events-none"><Users className="w-64 h-64" /></div>
                            <div className="absolute top-10 left-10 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-muted-foreground uppercase tracking-[0.2em] text-[10px] font-black opacity-80">Telemetry: Live View</span>
                            </div>

                            {servingToken ? (
                                <div className="text-center z-10 animate-in zoom-in-95 duration-500">
                                    <p className="text-primary font-black uppercase tracking-[0.3em] text-[11px] mb-4 opacity-80">Currently Attending</p>
                                    <h2 className="text-8xl sm:text-9xl font-black text-foreground tracking-tighter drop-shadow-sm select-none">
                                        {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                                    </h2>
                                    <div className="mt-6 space-y-1">
                                        <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">{servingToken.customerName}</p>
                                        <p className="text-muted-foreground font-mono text-xs sm:text-sm font-bold opacity-60 flex items-center justify-center gap-2">
                                            {servingToken.customerPhone}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center z-10 py-10">
                                    <div className="w-20 h-20 bg-secondary/50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-border/40">
                                        <Loader2 className="w-8 h-8 text-muted-foreground/30" />
                                    </div>
                                    <h2 className="text-4xl font-black text-muted-foreground/40 tracking-tighter uppercase select-none italic">Standby</h2>
                                    <p className="mt-2 text-xs font-black text-muted-foreground/60 tracking-widest uppercase">Waiting for first token initiation</p>
                                </div>
                            )}

                            <div className="absolute bottom-10 left-10 hidden sm:flex items-center gap-3 text-[9px] text-muted-foreground/40 font-black uppercase tracking-[0.2em]">
                                <RefreshCw className={cn("w-3 h-3", !isConnected && "animate-spin")} /> {lastUpdated?.toLocaleTimeString()}
                            </div>
                        </Card>

                        {/* CONTROL DECK */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                            {/* NEXT BUTTON (Big) */}
                            <Button
                                onClick={handleNext}
                                disabled={nextLoading || !isSessionActive || (waitingTokens.length === 0 && !servingToken)}
                                className={cn(
                                    "col-span-2 h-24 sm:h-32 text-2xl font-black rounded-[2rem] shadow-2xl transition-all active:scale-95 disabled:opacity-30 border-[1px]",
                                    "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
                                )}
                            >
                                {nextLoading ? <Loader2 className="animate-spin w-10 h-10 opacity-50" /> : (
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 sm:p-3 bg-white/20 rounded-2xl">
                                            <PlayCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-white/20" />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-[10px] uppercase tracking-widest opacity-60 font-black mb-1">Queue Evolution</div>
                                            <span className="tracking-tighter">{waitingTokens.length === 0 && servingToken ? "COMPLETE" : "PROCEED"}</span>
                                        </div>
                                    </div>
                                )}
                            </Button>

                            {/* SKIP */}
                            <Button
                                variant="outline"
                                onClick={handleSkip}
                                disabled={!servingToken || skipLoading || !isSessionActive}
                                className="h-24 sm:h-32 flex flex-col items-center justify-center gap-2 rounded-[2rem] border-2 border-border/60 bg-card hover:bg-secondary transition-all hover:border-primary/40 group active:scale-95"
                            >
                                {skipLoading ? <Loader2 className="animate-spin w-6 h-6 text-primary/40" /> : <SkipForward className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground group-hover:text-primary transition-colors" />}
                                <span className="font-black text-xs sm:text-sm tracking-widest uppercase opacity-70 group-hover:opacity-100">Skip</span>
                            </Button>

                            {/* EMERGENCY */}
                            <Button
                                variant="destructive"
                                onClick={handleEmergencyClick}
                                disabled={actionLoading || !isSessionActive}
                                className="h-24 sm:h-32 flex flex-col items-center justify-center gap-2 rounded-[2rem] shadow-xl shadow-rose-500/10 bg-rose-600 hover:bg-rose-700 transition-all border-b-4 border-rose-800 active:translate-y-1 active:border-b-0"
                            >
                                <AlertOctagon className="w-6 h-6 sm:w-8 sm:h-8 animate-pulse" />
                                <span className="font-black text-xs sm:text-sm tracking-widest uppercase">SOS</span>
                            </Button>
                        </div>

                        {/* SECONDARY CONTROLS */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {isSessionActive ? (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={handleUndo}
                                        disabled={nextLoading}
                                        className="h-16 font-black rounded-2xl border-border/60 bg-card/50 hover:bg-secondary flex gap-3 tracking-[0.1em] text-[11px] uppercase"
                                    >
                                        <RotateCcw className="w-4 h-4 text-primary" /> Redo Last Action
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={handlePauseToggle}
                                        disabled={pauseLoading}
                                        className={cn("h-16 font-black rounded-2xl border-border/60 bg-card/50 flex gap-3 tracking-[0.1em] text-[11px] uppercase transition-all",
                                            session?.status === 'OPEN' ? "hover:bg-amber-500/10 hover:text-amber-600" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                                        )}
                                    >
                                        {session?.status === 'OPEN' ? <><PauseCircle className="w-4 h-4 text-amber-500" /> Hold Queue</> : <><PlayCircle className="w-4 h-4 text-emerald-500" /> Resume Queue</>}
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        onClick={handleCloseQueue}
                                        className="h-16 font-black rounded-2xl text-muted-foreground/40 hover:bg-rose-500/10 hover:text-rose-600 flex gap-3 tracking-[0.1em] text-[11px] uppercase"
                                    >
                                        <Power className="w-4 h-4" /> Shutdown Session
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    onClick={handleStartSession}
                                    className="col-span-3 h-20 font-black rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xl shadow-emerald-600/20 text-lg tracking-tight transition-all active:scale-95"
                                >
                                    <div className="p-1.5 bg-white/20 rounded-lg mr-4">
                                        <PlayCircle className="w-6 h-6" />
                                    </div>
                                    INITIALIZE NEW CLINICAL SESSION
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Lists (4 cols) */}
                    <div className="xl:col-span-4 space-y-8 flex flex-col h-full">

                        {/* Add Token Section */}
                        <div className="flex items-center gap-3 mb-2">
                            <Plus className="w-4 h-4 text-primary/60" />
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Direct Registration</h3>
                        </div>
                        <div className="p-1.5 bg-card border border-border/60 rounded-[2rem] shadow-soft mb-2">
                            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                                <DialogTrigger asChild>
                                    <Button disabled={!isSessionActive || isLimitReached || addLoading} className="w-full h-16 bg-primary dark:bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-[1.7rem] text-sm tracking-widest uppercase shadow-lg shadow-primary/20 transition-all hover:-translate-y-1 active:translate-y-0">
                                        {isLimitReached ? "Capacity Reached" : "Register Walk-in"}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="dark:bg-slate-900 border-none rounded-[2rem] shadow-2xl p-6">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-primary/10 rounded-xl">
                                                <Plus className="w-5 h-5 text-primary" />
                                            </div>
                                            New Registration
                                        </DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handleManualAdd} className="space-y-6">
                                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-[1.5rem] border border-border/40">
                                            <div className="space-y-0.5">
                                                <Label className="text-sm font-black text-foreground">Priority Pulse</Label>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mt-1">Push to front for medical urgency</p>
                                            </div>
                                            <Switch
                                                checked={manualIsPriority}
                                                onCheckedChange={setManualIsPriority}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 ml-2">Patient Full Name</Label>
                                            <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Rahul Sharma" className="h-12 bg-secondary/30 border-border/40 rounded-xl" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 ml-2">Mobile Number (10 Digits)</Label>
                                            <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Enter phone number" className="h-12 bg-secondary/30 border-border/40 rounded-xl" />
                                        </div>
                                        <Button type="submit" disabled={addLoading} className="w-full h-14 bg-primary text-primary-foreground font-black tracking-widest uppercase rounded-xl shadow-lg shadow-primary/20 mt-4">
                                            {addLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Authorize Entry"}
                                        </Button>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Waiting List Section */}
                        <div className="flex flex-col flex-1 min-h-[500px]">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Waiting Chamber</h3>
                                </div>
                                <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none font-black px-3 rounded-lg">{waitingTokens.length}</Badge>
                            </div>

                            <Card className="flex-1 bg-card/50 backdrop-blur-md border-border/60 rounded-[2rem] shadow-soft overflow-hidden flex flex-col">
                                <div className="overflow-y-auto flex-1 p-4 space-y-3 custom-scrollbar">
                                    {visibleWaitingTokens.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-40">
                                            <div className="w-16 h-16 bg-secondary/50 rounded-[2rem] flex items-center justify-center mb-4">
                                                <Users className="w-8 h-8 text-muted-foreground/30" />
                                            </div>
                                            <p className="text-xs font-black uppercase tracking-widest leading-relaxed">No Active Pulse In Queue</p>
                                        </div>
                                    ) : (
                                        visibleWaitingTokens.map((t) => (
                                            <TokenItem
                                                key={t.id}
                                                token={t}
                                                onCancel={handleCancelToken}
                                            />
                                        ))
                                    )}
                                </div>

                                {/* Skipped/Secondary List */}
                                {skippedTokens.length > 0 && (
                                    <div className="bg-secondary/30 border-t border-border/60 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Skipped Tokens</h4>
                                            <div className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center text-[8px] font-black">{skippedTokens.length}</div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {skippedTokens.map(t => (
                                                <div key={t.id} className="group flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl bg-card border border-border/40 hover:border-primary/40 transition-all">
                                                    <span className="font-black text-[10px] text-foreground/70">{formatToken(t.tokenNumber, t.isPriority)}</span>
                                                    <Button size="icon" variant="ghost" className="h-6 w-6 rounded-lg text-primary hover:bg-primary/10" onClick={() => handleRecall(t.id)}>
                                                        <RotateCcw className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* Session Log / Intelligence Log */}
                        <div className="space-y-4">
                            <div
                                className="group flex items-center justify-between p-6 bg-card border border-border/60 rounded-3xl cursor-pointer hover:bg-secondary/50 transition-all shadow-soft"
                                onClick={() => setIsLogOpen(!isLogOpen)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-secondary/80 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110">
                                        <BarChart2 className="w-5 h-5 text-primary/60" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-foreground tracking-tight">Diagnostic Logs</h3>
                                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">{displayedTokens.length} Entries Recorded</p>
                                    </div>
                                </div>
                                <div className="p-1.5 bg-secondary/50 rounded-xl">
                                    {isLogOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                </div>
                            </div>

                            {isLogOpen && (
                                <Card className="bg-card border-border/60 rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
                                    <div className="p-4 border-b border-border/60 bg-secondary/20 space-y-4">
                                        <div className="flex gap-4">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                                <Input
                                                    placeholder="Search patient or phone..."
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                    className="pl-9 h-11 bg-background border-border shadow-none rounded-xl text-sm"
                                                />
                                            </div>
                                            <Input
                                                type="date"
                                                value={selectedDate}
                                                max={todayStr}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                                className="w-40 h-11 bg-background border-border shadow-none rounded-xl text-xs font-bold"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between px-1">
                                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-lg" onClick={async () => {
                                                const res = await exportPatientList(params.clinicSlug, selectedDate, selectedDate);
                                                if (res.error) { showToast(res.error, 'error'); return; }
                                                if (res.csv) {
                                                    const blob = new Blob(["\uFEFF", res.csv], { type: 'text/csv;charset=utf-8;' });
                                                    const url = URL.createObjectURL(blob);
                                                    const link = document.createElement("a");
                                                    const cleanClinicName = (res.clinicName || params.clinicSlug).replace(/[^a-z0-9]/gi, '_');
                                                    const cleanDate = selectedDate.replace(/-/g, '');
                                                    link.setAttribute("href", url);
                                                    link.setAttribute("download", `${cleanClinicName}_${cleanDate}.csv`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                    URL.revokeObjectURL(url);
                                                    showToast("CSV Intelligence Exported");
                                                }
                                            }}>
                                                <RefreshCw className="w-3 h-3 mr-2" /> Export to Data Sink
                                            </Button>
                                            <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Today: {totalServedCount} Served</span>
                                        </div>
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {historyLoading ? (
                                            <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-40">
                                                <Loader2 className="animate-spin w-8 h-8 text-primary" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Retrieving Logs...</span>
                                            </div>
                                        ) : (
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-secondary/40 sticky top-0 z-20">
                                                    <tr>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 w-24">Token</th>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Patient Meta</th>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 text-right">Verification</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {displayedTokens
                                                        .filter(t =>
                                                            (t.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                                                            (t.customerPhone || "").includes(searchTerm)
                                                        )
                                                        .map((t) => (
                                                            <tr key={t.id} className="hover:bg-secondary/30 transition-colors group">
                                                                <td className="px-6 py-4">
                                                                    <div className="h-10 w-10 bg-secondary/80 rounded-xl flex items-center justify-center font-black text-xs text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                        {formatToken(t.tokenNumber, t.isPriority)}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="font-black text-sm text-foreground tracking-tight">{t.customerName || 'Anonymous User'}</div>
                                                                    {t.customerPhone && <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">{t.customerPhone}</div>}
                                                                    {t.feedback && (
                                                                        <div className="mt-2 text-[10px] italic text-amber-600/80 dark:text-amber-400/80 leading-relaxed bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                                                                            &ldquo;{t.feedback}&rdquo;
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-widest py-0.5 px-2 border-0",
                                                                        t.status === 'SERVING' ? "bg-emerald-500/10 text-emerald-600" :
                                                                            t.status === 'WAITING' ? "bg-blue-500/10 text-blue-600" :
                                                                                t.status === 'SKIPPED' ? "bg-amber-500/10 text-amber-600" :
                                                                                    t.status === 'CANCELLED' ? "bg-rose-500/10 text-rose-600 line-through opacity-50" :
                                                                                        "bg-secondary/80 text-muted-foreground/60"
                                                                    )}>
                                                                        {t.status}
                                                                    </Badge>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* B4: Inline Edit Fragment */}
            {editingToken && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <Card className="bg-card border-border shadow-[0_32px_64px_rgba(0,0,0,0.2)] p-8 w-full max-w-sm rounded-[2rem] space-y-6 relative overflow-hidden">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                                <Pencil className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-black tracking-tight">Modify Patient</h3>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 ml-1">Identity</Label>
                                <Input
                                    value={editingToken.name}
                                    onChange={e => setEditingToken(t => t ? { ...t, name: e.target.value } : null)}
                                    className="h-12 bg-secondary/30 rounded-xl"
                                    placeholder="Patient name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 ml-1">Communication</Label>
                                <Input
                                    value={editingToken.phone}
                                    onChange={e => setEditingToken(t => t ? { ...t, phone: e.target.value } : null)}
                                    className="h-12 bg-secondary/30 rounded-xl"
                                    placeholder="Mobile number"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button variant="ghost" className="flex-1 h-12 rounded-xl font-bold" onClick={() => setEditingToken(null)}>Cancel</Button>
                            <Button className="flex-1 h-12 rounded-xl bg-primary font-black tracking-widest uppercase text-xs" disabled={actionLoading} onClick={handleSaveEdit}>
                                {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Authorize"}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* NOTIFICATION LAYER */}
            {toast && (
                <div className={cn(
                    "fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] px-6 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border backdrop-blur-3xl animate-in slide-in-from-bottom-8 duration-500 flex items-center gap-4 min-w-[320px] justify-center transition-all",
                    toast.type === 'success'
                        ? "bg-emerald-500/90 dark:bg-emerald-600/90 border-emerald-400/30 text-white"
                        : "bg-rose-500/90 dark:bg-rose-600/90 border-rose-400/30 text-white"
                )}>
                    <div className="w-2 h-2 rounded-full bg-white opacity-40 animate-ping" />
                    <span className="font-black text-xs tracking-widest uppercase">{toast.message}</span>
                </div>
            )}
        </div>
    );
}

