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
import { Loader2, SkipForward, PauseCircle, Users, AlertOctagon, LogOut, PlayCircle, Plus, XCircle, RefreshCw, Moon, Sun, Calendar, Power, ChevronDown, ChevronUp, Search, RotateCcw, Pencil, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TokenItem } from "./_components/TokenItem";
import { getClinicDate } from "@/lib/date";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function ReceptionPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, loading, refresh, lastUpdated, isConnected, dailyTokenLimit, setTokens } = useClinicRealtime(params.clinicSlug);

    // ── Per-action loading flags ─────────────────────────────────────────────
    // Each action has its own flag so one in-flight request doesn't block others.
    const [nextLoading, setNextLoading] = useState(false);
    const [skipLoading, setSkipLoading] = useState(false);
    const [pauseLoading, setPauseLoading] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    // Legacy alias: true if any heavy action is running (used only for Add form submit)
    const actionLoading = nextLoading || skipLoading || pauseLoading || addLoading;
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    // B1: Stalled queue detection — track how long since last NEXT
    const [servingChangedAt, setServingChangedAt] = useState<Date | null>(null);
    const [lastServingId, setLastServingId] = useState<string | null>(null);
    const [stallMinutes, setStallMinutes] = useState(0);

    // B4: Inline token edit
    const [editingToken, setEditingToken] = useState<{ id: string; name: string; phone: string } | null>(null);

    // Toggle Dark Mode
    useEffect(() => {
        if (darkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [darkMode]);

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

    // ── Generic action wrapper with optimistic UI support ───────────────────
    const performAction = async (
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
                alert(`Error: ${result.error}`);
            }
            // Do NOT call refresh() on success — realtime subscription fires automatically
        } catch (e) {
            if (rollback) rollback();
            console.error(e);
            alert("Unexpected Error");
        } finally {
            setLoading(false);
        }
    };

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

    const handleNext = () => {
        // Optimistic: mark current serving as SERVED, advance next WAITING to SERVING
        const snapshot = tokens; // capture for rollback
        performAction(
            () => nextPatient(params.clinicSlug),
            setNextLoading,
            () => {
                setTokens(prev => {
                    const next = [...prev];
                    // Mark current SERVING as SERVED
                    const servingIdx = next.findIndex(t => t.status === 'SERVING');
                    if (servingIdx !== -1) next[servingIdx] = { ...next[servingIdx], status: 'SERVED' };
                    // Find next WAITING (priority first, then sequential)
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
            () => setTokens(snapshot) // rollback to snapshot on error
        );
    };

    const handleSkip = () => {
        if (!servingToken) return;
        if (!confirm("Skip current ticket?")) return;
        const snapshot = tokens;
        performAction(
            () => skipToken(params.clinicSlug, servingToken.id),
            setSkipLoading,
            () => setTokens(prev => prev.map(t => t.id === servingToken.id ? { ...t, status: 'SKIPPED' } : t)),
            () => setTokens(snapshot)
        );
    };

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

    const handleCancelToken = (id: string) => {
        if (!confirm("Cancel this token?")) return;
        const snapshot = tokens;
        performAction(
            () => cancelToken(params.clinicSlug, id),
            setSkipLoading,
            () => setTokens(prev => prev.map(t => t.id === id ? { ...t, status: 'CANCELLED' } : t)),
            () => setTokens(snapshot)
        );
    };

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

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;

    const isSessionActive = session?.status === 'OPEN' || session?.status === 'PAUSED';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 p-3 pb-20 md:p-6 lg:p-8 font-sans relative">
            {showOfflineError && (
                <div className="fixed top-0 left-0 w-full bg-red-500 text-white text-center text-xs py-1 font-bold z-50 animate-in slide-in-from-top-full">
                    Reconnecting to live updates...
                </div>
            )}

            {/* B1: Stall warning — queue has not advanced in 5+ minutes */}
            {stallMinutes >= 5 && servingToken && session?.status === 'OPEN' && (
                <div className={`fixed top-0 left-0 w-full text-white text-center text-xs py-2 font-bold z-50 animate-pulse flex items-center justify-center gap-2 ${stallMinutes >= 10 ? 'bg-red-600' : 'bg-amber-500'
                    }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Queue stalled — {stallMinutes} min since last NEXT was pressed. Press NEXT or SKIP to continue.
                </div>
            )}


            {/* HEADER */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="h-10 w-10 md:h-12 md:w-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl md:text-2xl shadow-lg shadow-blue-500/30">
                        Q
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-tight">Queue Dashboard</h1>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs font-medium text-slate-500 dark:text-slate-400">
                            <span className="uppercase tracking-wider">Workspace: {params.clinicSlug}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {todayDate}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    {/* Status Badge */}
                    <div className={cn("px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs font-bold border flex items-center gap-2",
                        session?.status === 'OPEN' ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" :
                            session?.status === 'PAUSED' ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" :
                                "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                    )}>
                        <div className={cn("w-1.5 h-1.5 md:w-2 md:h-2 rounded-full",
                            session?.status === 'OPEN' ? "bg-green-600 animate-pulse" : session?.status === 'PAUSED' ? "bg-yellow-600" : "bg-red-600"
                        )}></div>
                        {session?.status || "CLOSED"}
                    </div>

                    <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-full h-8 w-8 md:h-10 md:w-10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        {darkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
                    </Button>

                    <Button variant="ghost" size="sm" onClick={() => logout()} className="text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl h-8 text-xs md:text-sm md:h-9">
                        <LogOut className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Logout
                    </Button>
                </div>
            </header>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">

                {/* LEFT COLUMN: Controls & Status (8 cols) */}
                <div className="xl:col-span-8 space-y-4 md:space-y-6">

                    {/* HERO CARD: Now Serving */}
                    <Card className="relative overflow-hidden border-0 shadow-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white h-56 md:h-72 flex flex-col items-center justify-center p-6 md:p-8 rounded-3xl">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Users className="w-32 h-32 md:w-48 md:h-48" /></div>
                        <p className="text-blue-100 uppercase tracking-[0.2em] text-xs md:text-sm font-bold mb-2 md:mb-4">Now Serving</p>

                        {servingToken ? (
                            <div className="text-center z-10 animate-in zoom-in duration-300">
                                <h2 className="text-7xl md:text-9xl font-black drop-shadow-lg tracking-tighter">
                                    {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                                </h2>
                                <div className="mt-2 md:mt-4 flex flex-col items-center">
                                    <p className="text-xl md:text-2xl font-bold">{servingToken.customerName}</p>
                                    <p className="text-blue-200 font-mono text-xs md:text-sm">{servingToken.customerPhone}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center z-10 opacity-60">
                                <div className="text-6xl md:text-7xl font-black text-white/50">--</div>
                                <p className="mt-2 text-base md:text-lg font-medium text-blue-100">Waiting for next ticket</p>
                            </div>
                        )}

                        <div className="absolute bottom-4 left-6 md:bottom-6 md:left-8 flex items-center gap-2 text-[10px] text-blue-200/80 font-mono uppercase tracking-widest">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Last synced: {lastUpdated.toLocaleTimeString()}
                        </div>
                    </Card>

                    {/* CONTROL DECK */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        {/* NEXT BUTTON (Big) */}
                        <Button
                            onClick={handleNext}
                            disabled={nextLoading || !isSessionActive || (waitingTokens.length === 0 && !servingToken)}
                            className={cn("col-span-2 h-20 md:h-24 text-xl md:text-2xl font-black rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:grayscale",
                                "bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                            )}
                        >
                            {nextLoading ? <Loader2 className="animate-spin w-8 h-8" /> : (
                                <div className="flex items-center gap-2 md:gap-3">
                                    <PlayCircle className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
                                    <span>{waitingTokens.length === 0 && servingToken ? "FINISH" : "NEXT"}</span>
                                </div>
                            )}
                        </Button>

                        {/* SKIP */}
                        <Button
                            variant="outline"
                            onClick={handleSkip}
                            disabled={!servingToken || skipLoading || !isSessionActive}
                            className="h-20 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-300"
                        >
                            {skipLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <SkipForward className="w-5 h-5 md:w-6 md:h-6 text-slate-500" />}
                            <span className="font-bold text-base md:text-lg">SKIP</span>
                        </Button>

                        {/* EMERGENCY */}
                        <Button
                            variant="destructive"
                            onClick={handleEmergencyClick}
                            disabled={actionLoading || !isSessionActive}
                            className="h-20 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl shadow-red-500/20 bg-red-600 hover:bg-red-700 border-t-4 border-red-400"
                        >
                            <AlertOctagon className="w-5 h-5 md:w-6 md:h-6" />
                            <span className="font-bold text-base md:text-lg">SOS</span>
                        </Button>
                    </div>

                    {/* SECONDARY CONTROLS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {isSessionActive ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleUndo}
                                    disabled={nextLoading}
                                    className="h-16 font-bold rounded-2xl border-2 dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50"
                                >
                                    <RotateCcw className="mr-2 w-5 h-5" /> UNDO
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={handlePauseToggle}
                                    disabled={pauseLoading}
                                    className={cn("h-16 font-bold rounded-2xl border-2 dark:bg-slate-800 dark:border-slate-700",
                                        session?.status === 'OPEN' ? "text-slate-600 dark:text-slate-300 hover:bg-slate-50" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
                                    )}
                                >
                                    {session?.status === 'OPEN' ? <><PauseCircle className="mr-2 w-5 h-5" /> PAUSE</> : <><PlayCircle className="mr-2 w-5 h-5" /> RESUME</>}
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={handleCloseQueue}
                                    className="h-16 font-bold rounded-2xl text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 border border-transparent hover:border-red-100"
                                >
                                    <Power className="mr-2 w-5 h-5" /> CLOSE
                                </Button>
                            </>
                        ) : (
                            <Button
                                onClick={handleStartSession}
                                className="col-span-2 h-16 font-bold rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-lg text-lg"
                            >
                                <PlayCircle className="mr-2 w-6 h-6" /> START NEW SESSION
                            </Button>
                        )}
                    </div>

                </div>

                {/* RIGHT COLUMN: Lists (4 cols) */}
                <div className="xl:col-span-4 space-y-6 flex flex-col h-full">

                    {/* Add Token Card */}
                    <Card className="p-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                            <DialogTrigger asChild>
                                <Button disabled={!isSessionActive || isLimitReached || addLoading} className="w-full h-14 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold rounded-xl text-lg shadow-lg">
                                    <Plus className="w-5 h-5 mr-2" /> {isLimitReached ? "Daily Limit Reached" : "Add Walk-in"}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="dark:bg-slate-900 dark:border-slate-800 text-slate-900 dark:text-white">
                                <DialogHeader><DialogTitle>Add Walk-in Ticket</DialogTitle></DialogHeader>
                                <form onSubmit={handleManualAdd} className="space-y-4 py-4">
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="space-y-0.5">
                                            <Label className="font-bold text-slate-900 dark:text-white">Priority / Emergency</Label>
                                            <p className="text-xs text-slate-500">Push ticket to the front of the queue</p>
                                        </div>
                                        <Switch
                                            checked={manualIsPriority}
                                            onCheckedChange={setManualIsPriority}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="dark:text-slate-300">Customer Name</Label>
                                        <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. John Doe" className="dark:bg-slate-800 dark:border-slate-700" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="dark:text-slate-300">Phone Number</Label>
                                        <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="98765 43210 (10 digits)" className="dark:bg-slate-800 dark:border-slate-700" />
                                    </div>
                                    <Button type="submit" disabled={actionLoading} className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg font-bold">Create Token</Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </Card>

                    {/* Waiting List */}
                    <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300">Waiting</h3>
                            <div className="flex items-center gap-2">
                                {waitingTokens.length > 50 && <span className="text-[10px] text-slate-400">Top 50</span>}
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0">{waitingTokens.length}</Badge>
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-2 max-h-[400px]">
                            {visibleWaitingTokens.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 p-8 text-center">
                                    <Users className="w-8 h-8 mb-2 opacity-50" />
                                    <p className="text-sm">Queue is empty</p>
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
                    </div>

                    {/* Skipped List */}
                    {skippedTokens.length > 0 && (
                        <Card className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">Skipped ({skippedTokens.length})</div>
                            <div className="max-h-32 overflow-y-auto">
                                {skippedTokens.map(t => (
                                    <div key={t.id} className="p-2 flex items-center justify-between text-sm px-4">
                                        <span className="font-mono text-slate-500 dark:text-slate-400">{formatToken(t.tokenNumber, t.isPriority)}</span>
                                        <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" onClick={() => handleRecall(t.id)}>
                                            Recall
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            onClick={() => setIsLogOpen(!isLogOpen)}
                        >
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-slate-500" />
                                <h3 className="font-bold text-slate-700 dark:text-slate-300">Session Log</h3>
                                <Badge variant="secondary" className="ml-2">{displayedTokens.length}</Badge>
                            </div>
                            {isLogOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>

                        {isLogOpen && (
                            <div className="border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2">
                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={async () => {
                                                const res = await exportPatientList(params.clinicSlug, selectedDate, selectedDate);
                                                if (res.error) {
                                                    alert(res.error);
                                                    return;
                                                }
                                                if (res.csv) {
                                                    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + res.csv);
                                                    const link = document.createElement("a");
                                                    link.setAttribute("href", encodedUri);
                                                    link.setAttribute("download", `session_log_${selectedDate}.csv`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                }
                                            }}>
                                                Download CSV
                                            </Button>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setIsLogOpen(false)}><XCircle className="w-5 h-5 text-slate-400" /></Button>
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Search..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-9 h-9 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                            />
                                        </div>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            max={todayStr}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            className="w-36 h-9 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="max-h-[300px] overflow-y-auto p-0">
                                    {historyLoading ? (
                                        <div className="py-8 flex justify-center text-slate-400"><Loader2 className="animate-spin w-5 h-5" /></div>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-2 font-semibold">Tkn</th>
                                                    <th className="px-4 py-2 font-semibold">Name</th>
                                                    <th className="px-4 py-2 font-semibold">Feedback</th>
                                                    <th className="px-4 py-2 font-semibold text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {displayedTokens
                                                    .filter(t =>
                                                        (t.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                                                        (t.customerPhone || "").includes(searchTerm)
                                                    )
                                                    .map((t) => (
                                                        <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                                                                {formatToken(t.tokenNumber, t.isPriority)}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-900 dark:text-white font-medium max-w-[100px] truncate">
                                                                {t.customerName || '—'}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs max-w-[140px]">
                                                                {t.feedback ? (
                                                                    <span className="italic text-orange-700 dark:text-orange-400">&ldquo;{t.feedback}&rdquo;</span>
                                                                ) : (
                                                                    <span className="text-slate-300">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <Badge variant="outline" className={cn("text-[10px] uppercase",
                                                                    t.status === 'SERVING' ? "bg-green-50 text-green-700 border-green-200" :
                                                                        t.status === 'WAITING' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                                            t.status === 'SKIPPED' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                                                                t.status === 'CANCELLED' ? "bg-red-50 text-red-700 border-red-200 line-through opacity-70" :
                                                                                    "bg-slate-100 text-slate-600 border-slate-200"
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
                            </div>
                        )}
                    </Card>

                    {/* Stats Footer */}
                    <div className="text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-600 font-medium">
                            Total Served: <span className="text-slate-900 dark:text-slate-300 font-bold">{totalServedCount}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* B4: Edit Token Modal */}
            {editingToken && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
                        <div className="flex items-center gap-2">
                            <Pencil className="w-4 h-4 text-blue-500" />
                            <h3 className="font-bold text-slate-900 dark:text-white">Edit Patient Info</h3>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <Label className="text-xs text-slate-500 font-semibold uppercase">Name</Label>
                                <Input
                                    value={editingToken.name}
                                    onChange={e => setEditingToken(t => t ? { ...t, name: e.target.value } : null)}
                                    className="mt-1"
                                    placeholder="Patient name"
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500 font-semibold uppercase">Phone</Label>
                                <Input
                                    value={editingToken.phone}
                                    onChange={e => setEditingToken(t => t ? { ...t, phone: e.target.value } : null)}
                                    className="mt-1"
                                    placeholder="Phone number"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setEditingToken(null)}>Cancel</Button>
                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={actionLoading} onClick={handleSaveEdit}>
                                {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Save Changes"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

