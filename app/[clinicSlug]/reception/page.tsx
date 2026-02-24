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
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TokenItem } from "./_components/TokenItem";
import { getClinicDate } from "@/lib/date";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function ReceptionPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, loading, refresh, lastUpdated, isConnected, dailyTokenLimit, setTokens } = useClinicRealtime(params.clinicSlug);

    // ── Per-action loading flags ────────────────────────────────────────────────
    const [nextLoading, setNextLoading] = useState(false);
    const [skipLoading, setSkipLoading] = useState(false);
    const [pauseLoading, setPauseLoading] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    const actionLoading = nextLoading || skipLoading || pauseLoading || addLoading;
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // Stalled queue detection
    const [servingChangedAt, setServingChangedAt] = useState<Date | null>(null);
    const [lastServingId, setLastServingId] = useState<string | null>(null);
    const [stallMinutes, setStallMinutes] = useState(0);

    // Inline token edit
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

    // ── Generic action wrapper ───────────────────────────────────────────────
    const performAction = async (
        actionFn: () => Promise<{ error?: string;[key: string]: unknown }>,
        setLoading: (v: boolean) => void,
        optimisticUpdate?: () => void,
        rollback?: () => void
    ) => {
        setLoading(true);
        if (optimisticUpdate) optimisticUpdate();
        try {
            const result = await actionFn();
            if (result && result.error) {
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
        const snapshot = tokens;
        performAction(
            () => nextPatient(params.clinicSlug),
            setNextLoading,
            () => {
                setTokens(prev => {
                    const next = [...prev];
                    const servingIdx = next.findIndex(t => t.status === 'SERVING');
                    if (servingIdx !== -1) next[servingIdx] = { ...next[servingIdx], status: 'SERVED' };
                    const waiting = next.filter(t => t.status === 'WAITING').sort((a, b) => {
                        if (a.isPriority && !b.isPriority) return -1;
                        if (!a.isPriority && b.isPriority) return 1;
                        return a.tokenNumber - b.tokenNumber;
                    });
                    if (waiting.length > 0) {
                        const nextIdx = next.findIndex(t => t.id === waiting[0].id);
                        if (nextIdx !== -1) next[nextIdx] = { ...next[nextIdx], status: 'SERVING' };
                    }
                    return next;
                });
            },
            () => setTokens(snapshot)
        );
    };

    const handleSkip = () => {
        if (!servingToken) return;
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
        performAction(() => undoLastAction(params.clinicSlug), setNextLoading);
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
        const snapshot = tokens;
        performAction(
            () => recallToken(params.clinicSlug, id),
            setNextLoading,
            () => setTokens(prev => prev.map(t => t.id === id ? { ...t, status: 'WAITING', isPriority: true } : t)),
            () => setTokens(snapshot)
        );
    };

    const handleCancelToken = (id: string) => {
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
        if (manualPhone.trim() !== "" && manualPhone !== "0000000000") {
            if (!isValidIndianPhone(manualPhone)) {
                showToast("Please enter a valid 10-digit Indian mobile number", 'error');
                return;
            }
        } else if (!manualIsPriority) {
            showToast("A valid mobile number is required for standard walk-ins", 'error');
            return;
        }

        setAddLoading(true);
        const res = await createToken(params.clinicSlug, manualPhone, manualName, manualIsPriority);
        if (res.error) {
            if (res.is_duplicate) {
                showToast(`Token #${res.existing_token_number} already exists`, 'error');
                setIsAddModalOpen(false);
            } else if (res.limit_reached) {
                showToast(`Daily limit reached`, 'error');
                setIsAddModalOpen(false);
            } else {
                showToast(res.error, 'error');
            }
        } else {
            setIsAddModalOpen(false);
            setManualName("");
            setManualPhone("");
            setManualIsPriority(false);
            refresh();
            showToast("Token Created");
        }
        setAddLoading(false);
    };

    const handleSaveEdit = async () => {
        if (!editingToken) return;
        if (editingToken.phone && editingToken.phone.trim() !== "") {
            if (!isValidIndianPhone(editingToken.phone)) {
                showToast("Invalid mobile number", 'error');
                return;
            }
        }
        setAddLoading(true);
        const res = await updateToken(params.clinicSlug, editingToken.id, editingToken.name, editingToken.phone);
        if (res.error) showToast(res.error, 'error');
        else { setEditingToken(null); refresh(); showToast("Token Updated"); }
        setAddLoading(false);
    };

    // Stall detection
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
        }, 30000);
        return () => clearInterval(interval);
    }, [servingChangedAt, session?.status]);

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

            {stallMinutes >= 5 && servingToken && session?.status === 'OPEN' && (
                <div className={`fixed top-0 left-0 w-full text-white text-center text-xs py-2 font-bold z-50 animate-pulse flex items-center justify-center gap-2 ${stallMinutes >= 10 ? 'bg-red-600' : 'bg-amber-500'}`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Queue stalled — {stallMinutes} min since last advance
                </div>
            )}

            {/* HEADER */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="h-10 w-10 md:h-12 md:w-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl md:text-2xl shadow-lg shadow-blue-500/30">Q</div>
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-tight">Reception</h1>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs font-medium text-slate-500 dark:text-slate-400">
                            <span className="uppercase tracking-wider">{params.clinicSlug}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {todayDate}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
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
                    <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-full h-8 w-8 text-slate-500 dark:text-slate-400">
                        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => logout()} className="text-slate-500 text-xs h-8">
                        <LogOut className="w-3 h-3 mr-1" /> Logout
                    </Button>
                </div>
            </header>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* LEFT: Controls (8 cols) */}
                <div className="xl:col-span-8 space-y-6">
                    {/* SERVING CARD */}
                    <Card className="relative overflow-hidden border-0 shadow-lg bg-blue-600 text-white h-72 flex flex-col items-center justify-center p-8 rounded-3xl">
                        <p className="text-blue-100 uppercase tracking-widest text-sm font-bold mb-4">Now Serving</p>
                        {servingToken ? (
                            <div className="text-center z-10">
                                <h2 className="text-8xl md:text-9xl font-black tracking-tighter shadow-sm">
                                    {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                                </h2>
                                <div className="mt-4">
                                    <p className="text-2xl font-bold">{servingToken.customerName || 'Anonymous'}</p>
                                    <p className="text-blue-100/70 font-mono text-sm">{servingToken.customerPhone}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center z-10 opacity-60">
                                <div className="text-8xl font-black">--</div>
                                <p className="mt-2 text-lg">Wait for next patient</p>
                            </div>
                        )}
                        <div className="absolute bottom-6 left-8 flex items-center gap-2 text-[10px] text-blue-200/60 uppercase font-mono tracking-widest">
                            <RefreshCw className={cn("w-3 h-3", !isConnected && "animate-spin")} /> {lastUpdated.toLocaleTimeString()}
                        </div>
                    </Card>

                    {/* CONTROL DECK */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Button
                            onClick={handleNext}
                            disabled={nextLoading || !isSessionActive || (waitingTokens.length === 0 && !servingToken)}
                            className="col-span-2 h-24 text-2xl font-black rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 shadow-sm"
                        >
                            {nextLoading ? <Loader2 className="animate-spin w-8 h-8" /> : (
                                <div className="flex items-center gap-3">
                                    <PlayCircle className="w-8 h-8 text-blue-600" />
                                    <span>{waitingTokens.length === 0 && servingToken ? "FINISH" : "NEXT PATIENT"}</span>
                                </div>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleSkip}
                            disabled={!servingToken || skipLoading || !isSessionActive}
                            className="h-24 flex flex-col gap-2 rounded-2xl border-2 border-slate-200 dark:border-slate-800"
                        >
                            {skipLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <SkipForward className="w-6 h-6" />}
                            <span className="font-bold text-xs uppercase tracking-widest">Skip</span>
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleEmergencyClick}
                            disabled={actionLoading || !isSessionActive}
                            className="h-24 flex flex-col gap-2 rounded-2xl bg-red-600 hover:bg-red-700"
                        >
                            <AlertOctagon className="w-6 h-6" />
                            <span className="font-bold text-xs uppercase tracking-widest">Urgent</span>
                        </Button>
                    </div>

                    {/* EXTRA CONTROLS */}
                    <div className="grid grid-cols-3 gap-4">
                        {isSessionActive ? (
                            <>
                                <Button variant="outline" onClick={handleUndo} className="h-16 font-bold rounded-2xl border-2">Undo</Button>
                                <Button variant="outline" onClick={handlePauseToggle} className="h-16 font-bold rounded-2xl border-2">
                                    {session?.status === 'OPEN' ? 'Pause' : 'Resume'}
                                </Button>
                                <Button variant="ghost" onClick={handleCloseQueue} className="h-16 font-bold rounded-2xl text-red-500 hover:bg-red-50">Close</Button>
                            </>
                        ) : (
                            <Button onClick={handleStartSession} className="col-span-3 h-16 text-xl font-bold rounded-2xl bg-green-600">Start Session</Button>
                        )}
                    </div>
                </div>

                {/* RIGHT: Lists (4 cols) */}
                <div className="xl:col-span-4 space-y-6">
                    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={!isSessionActive || isLimitReached} className="w-full h-16 bg-slate-900 text-white rounded-2xl text-lg font-bold shadow-lg">
                                <Plus className="mr-2" /> Add Walk-in
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Add Patient</DialogTitle></DialogHeader>
                            <form onSubmit={handleManualAdd} className="space-y-4 py-4">
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border">
                                    <Label className="font-bold">Urgent / Priority</Label>
                                    <Switch checked={manualIsPriority} onCheckedChange={setManualIsPriority} />
                                </div>
                                <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Patient Name" />
                                <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="Phone number" />
                                <Button type="submit" disabled={addLoading} className="w-full h-12 bg-blue-600 text-white font-bold">Create Token</Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* WAITING LIST */}
                    <Card className="flex flex-col h-[500px] border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300">Queue</h3>
                            <Badge className="bg-blue-600 text-white">{waitingTokens.length}</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {visibleWaitingTokens.map(t => (
                                <TokenItem key={t.id} token={t} onCancel={handleCancelToken} />
                            ))}
                            {visibleWaitingTokens.length === 0 && <div className="text-center py-20 text-slate-400">Box is empty</div>}
                        </div>
                    </Card>

                    {/* SKIPPED */}
                    {skippedTokens.length > 0 && (
                        <Card className="p-2 border-slate-200 dark:border-slate-800 rounded-2xl">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Skipped Today</div>
                            <div className="space-y-1">
                                {skippedTokens.map(t => (
                                    <div key={t.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                                        <span className="font-mono font-bold text-sm tracking-tighter">{formatToken(t.tokenNumber, t.isPriority)}</span>
                                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600" onClick={() => handleRecall(t.id)}>Recall</Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* SESSION LOG (Bottom) */}
            <div className="mt-8">
                <Card className="border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div
                        className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                        onClick={() => setIsLogOpen(!isLogOpen)}
                    >
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-slate-400" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-300">Daily Patient Log</h3>
                            <Badge variant="outline" className="ml-2">{displayedTokens.length}</Badge>
                        </div>
                        {isLogOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>

                    {isLogOpen && (
                        <div className="border-t animate-in slide-in-from-top-2">
                            <div className="p-4 bg-slate-50 dark:bg-slate-900 flex flex-wrap gap-4 items-center justify-between">
                                <div className="flex gap-4 items-center">
                                    <div className="relative w-64">
                                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Search by name or phone..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                    <Input
                                        type="date"
                                        value={selectedDate}
                                        max={todayStr}
                                        onChange={e => setSelectedDate(e.target.value)}
                                        className="w-40"
                                    />
                                    <Button variant="outline" className="font-bold" onClick={async () => {
                                        showToast("Generating CSV...", "success");
                                        const res = await exportPatientList(params.clinicSlug, selectedDate, selectedDate);
                                        if (res.error) {
                                            showToast(res.error, 'error');
                                            return;
                                        }
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
                                            showToast("CSV Downloaded");
                                        }
                                    }}>
                                        Export Log (CSV)
                                    </Button>
                                </div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    Served: {totalServedCount}
                                </div>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto">
                                {historyLoading ? (
                                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div>
                                ) : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold sticky top-0">
                                            <tr>
                                                <th className="px-6 py-3">Token</th>
                                                <th className="px-6 py-3">Patient</th>
                                                <th className="px-6 py-3">Phone</th>
                                                <th className="px-6 py-3">Feedback</th>
                                                <th className="px-6 py-3 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {displayedTokens
                                                .filter(t =>
                                                    (t.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                                                    (t.customerPhone || "").includes(searchTerm)
                                                )
                                                .map(t => (
                                                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                        <td className="px-6 py-4 font-mono font-bold">{formatToken(t.tokenNumber, t.isPriority)}</td>
                                                        <td className="px-6 py-4 font-medium">{t.customerName || '—'}</td>
                                                        <td className="px-6 py-4 text-slate-500">{t.customerPhone || '—'}</td>
                                                        <td className="px-6 py-4 max-w-xs truncate italic text-orange-600">
                                                            {t.feedback ? <>&ldquo;{t.feedback}&rdquo;</> : "—"}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <Badge variant="outline" className={cn("text-[9px] border-0",
                                                                t.status === 'SERVED' ? "bg-emerald-50 text-emerald-600" :
                                                                    t.status === 'CANCELLED' ? "bg-rose-50 text-rose-600 line-through" :
                                                                        "bg-slate-100 text-slate-600"
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
            </div>

            {/* EDIT MODAL */}
            {editingToken && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm p-6 rounded-3xl shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <Pencil className="text-blue-600" />
                            <h3 className="text-xl font-bold">Edit Patient</h3>
                        </div>
                        <div className="space-y-4">
                            <Input value={editingToken.name} onChange={e => setEditingToken({ ...editingToken, name: e.target.value })} placeholder="Name" />
                            <Input value={editingToken.phone} onChange={e => setEditingToken({ ...editingToken, phone: e.target.value })} placeholder="Phone" />
                            <div className="flex gap-2 pt-4">
                                <Button variant="ghost" className="flex-1" onClick={() => setEditingToken(null)}>Cancel</Button>
                                <Button className="flex-1 bg-blue-600" onClick={handleSaveEdit}>Save</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TOAST */}
            {toast && (
                <div className={cn(
                    "fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-bottom-5",
                    toast.type === 'success' ? "bg-slate-900 text-white" : "bg-red-600 text-white"
                )}>
                    <span className="font-bold text-sm tracking-wide">{toast.message}</span>
                </div>
            )}
        </div>
    );
}
