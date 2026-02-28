"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { nextPatient, skipToken, cancelToken, recallToken, pauseQueue, resumeQueue, createToken, closeQueue, startSession, getTokensForDate, updateToken, toggleArrivalStatus } from "@/app/actions/queue";
import { exportPatientList } from "@/app/actions/export";
import { isValidIndianPhone } from "@/lib/phone";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, SkipForward, Users, AlertOctagon, LogOut, PlayCircle, RefreshCw, Moon, Sun, Calendar, ChevronDown, ChevronUp, Search, Pencil, AlertTriangle, Activity, ActivitySquare, Smartphone, Zap, UserPlus, UserCheck, Clock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { TokenItem } from "./_components/TokenItem";
import { getClinicDate } from "@/lib/date";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { DoctorLoadPanel } from "./_components/DoctorLoadPanel";
import { VisitTimeline } from "./_components/VisitTimeline";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function ReceptionPage({ params }: { params: { clinicSlug: string } }) {
    const { session, tokens, departments, doctors, loading, refresh, lastUpdated, isConnected, dailyTokenLimit, servedCount, setTokens } = useClinicRealtime(params.clinicSlug);

    // ── Per-action loading flags ────────────────────────────────────────────────
    const [nextLoading, setNextLoading] = useState(false);
    const [skipLoading, setSkipLoading] = useState(false);
    const [, setPauseLoading] = useState(false);
    const [addLoading, setAddLoading] = useState(false);

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
    const [manualDepartmentId, setManualDepartmentId] = useState<string>("any");
    const [manualDoctorId, setManualDoctorId] = useState<string>("any");

    // Queue Controls
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterDoctorId, setFilterDoctorId] = useState<string>("all");
    const [timelineTokenId, setTimelineTokenId] = useState<string | null>(null);

    // History State
    interface Token {
        id: string;
        tokenNumber: number;
        isPriority: boolean;
        status: string;
        customerName?: string | null;
        customerPhone?: string | null;
        feedback?: string | null;
        departmentId?: string | null;
        doctorId?: string | null;
    }

    const todayStr = getClinicDate();
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [historyTokens, setHistoryTokens] = useState<Token[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(false);
    const [historyOffset, setHistoryOffset] = useState(0);
    const PAGE_SIZE = 50;

    // Fetch History/Log Data
    const fetchLog = useCallback(async (isLoadMore = false) => {
        setHistoryLoading(true);
        const nextOffset = isLoadMore ? historyOffset + PAGE_SIZE : 0;
        const res = await getTokensForDate(params.clinicSlug, selectedDate, PAGE_SIZE, nextOffset);

        if (res.tokens) {
            if (isLoadMore) {
                setHistoryTokens(prev => [...prev, ...res.tokens]);
            } else {
                setHistoryTokens(res.tokens);
            }
            setHasMoreHistory(res.hasMore || false);
            setHistoryOffset(nextOffset);
        }
        setHistoryLoading(false);
    }, [params.clinicSlug, selectedDate, historyOffset]);

    useEffect(() => {
        if (!isLogOpen) return;
        setHistoryOffset(0);
        fetchLog(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, isLogOpen]);

    const displayedTokens = historyTokens;

    // ── Generic action wrapper ───────────────────────────────────────────────
    const [lastActionTime, setLastActionTime] = useState(0);

    const performAction = async (
        actionFn: () => Promise<{ error?: string;[key: string]: unknown }>,
        setLoading: (v: boolean) => void,
        optimisticUpdate?: () => void,
        rollback?: () => void
    ) => {
        if (Date.now() - lastActionTime < 500) return; // Debounce all queue mutations (Chaos Test proven)
        setLastActionTime(Date.now());

        // INSTANT UI: Update local state before anything else
        if (optimisticUpdate) optimisticUpdate();

        // Background the request
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
            // Optional: small delay before clearing loading state to prevent double-clicks
            setTimeout(() => setLoading(false), 200);
        }
    };

    // MEMOIZED DERIVED STATE
    const waitingTokens = useMemo(() => {
        return tokens
            .filter(t => t.status === 'WAITING')
            .filter(t => filterDoctorId === "all" || t.doctorId === filterDoctorId)
            .sort((a, b) => {
                if (a.isPriority && !b.isPriority) return -1;
                if (!a.isPriority && b.isPriority) return 1;
                return a.tokenNumber - b.tokenNumber;
            });
    }, [tokens, filterDoctorId]);

    const visibleWaitingTokens = useMemo(() => waitingTokens.slice(0, 50), [waitingTokens]);
    const servingToken = useMemo(() => tokens.find(t => t.status === 'SERVING') || null, [tokens]);
    const skippedTokens = useMemo(() => {
        return tokens.filter(t => t.status === 'SKIPPED').sort((a, b) => a.tokenNumber - b.tokenNumber);
    }, [tokens]);

    const totalServedCount = useMemo(() => {
        if (selectedDate === todayStr) return servedCount;
        return displayedTokens.filter(t => t.status === 'SERVED').length;
    }, [servedCount, displayedTokens, selectedDate, todayStr]);

    const activeTokensCount = useMemo(() => {
        return tokens.filter(t => t.status === 'WAITING' || t.status === 'SERVING').length;
    }, [tokens]);

    const isLimitReached = dailyTokenLimit !== null && dailyTokenLimit > 0 && activeTokensCount >= dailyTokenLimit;

    // ── Action handlers ──────────────────────────────────────────────────────
    const handleNext = (doctorId?: string) => {
        const snapshot = tokens;
        performAction(
            () => nextPatient(params.clinicSlug, doctorId),
            setNextLoading,
            () => {
                setTokens(prev => {
                    const next = [...prev];
                    // Logic for optimistic update with doctorId is more complex, 
                    // relying on background refresh for doctor-specific calls
                    if (!doctorId) {
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
                    }
                    return next;
                });
                if (doctorId) refresh();
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
        if (addLoading) return;
        setManualIsPriority(true);
        setManualName("");
        setManualPhone("0000000000");
        setManualDepartmentId("any");
        setManualDoctorId("any");
        setIsAddModalOpen(true);
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

    // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
    // N = Next Patient | S = Skip | E = Emergency Token | P = Pause/Resume | R = Refresh
    useKeyboardShortcuts({
        'n': () => { if (session?.status === 'OPEN') handleNext(); },
        's': () => { if (servingToken) handleSkip(); },
        'e': handleEmergencyClick,
        'p': handlePauseToggle,
        'r': refresh,
    });

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

    const handleToggleArrived = (id: string, isArrived: boolean) => {
        const snapshot = tokens;
        performAction(
            () => toggleArrivalStatus(params.clinicSlug, id, isArrived),
            setNextLoading,
            () => setTokens(prev => prev.map(t => t.id === id ? { ...t, isArrived, status: 'WAITING', graceExpiresAt: null } : t)),
            () => setTokens(snapshot)
        );
    };

    const handleManualAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (addLoading) return;

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
        try {
            const r_deptId = manualDepartmentId === "any" ? null : manualDepartmentId;
            const r_docId = manualDoctorId === "any" ? null : manualDoctorId;

            const res = await createToken(params.clinicSlug, manualPhone, manualName, manualIsPriority, 'OPD', r_deptId, r_docId);
            if (!res.success) {
                if (res.is_duplicate) {
                    showToast(`Patient already has an active visit`, 'error');
                } else if (res.limit_reached) {
                    showToast(`Daily limit reached`, 'error');
                } else {
                    showToast(res.error, 'error');
                }
                setManualName("");
                setManualPhone("");
                setManualIsPriority(false);
                setManualDepartmentId("any");
                setManualDoctorId("any");
                setIsAddModalOpen(false);
            } else {
                setIsAddModalOpen(false);
                setManualName("");
                setManualPhone("");
                setManualIsPriority(false);
                setManualDepartmentId("any");
                setManualDoctorId("any");
                // Background refresh
                refresh();
                showToast("Token Created", "success");
            }
        } catch {
            showToast("Failed to create token", "error");
        } finally {
            setAddLoading(false);
        }
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
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] transition-colors duration-300 p-3 pb-20 md:p-6 lg:p-8 font-sans relative overflow-x-hidden">
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
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl p-6 md:p-8 rounded-[3rem] mb-12 border border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/10 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-sky-400 to-indigo-600 opacity-80" />
                <div className="flex items-center gap-6 relative z-10">
                    <div className="h-16 w-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white font-black text-3xl shadow-2xl shadow-indigo-600/40 border-2 border-white/20 group-hover:rotate-6 transition-transform duration-500">Q</div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-none uppercase tracking-tighter">Reception Command</h1>
                        <div className="flex items-center gap-4 text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-2">
                            <span className="text-indigo-500 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> {params.clinicSlug}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"></span>
                            <span className="flex items-center gap-1.5 text-slate-500"><Calendar className="w-3.5 h-3.5" /> {todayDate}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"></span>
                            <span className="flex items-center gap-1.5"><RefreshCw className={cn("w-3.5 h-3.5 text-indigo-400", loading && "animate-spin")} /> v2.4.0</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    <div className={cn("px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] border-2 flex items-center gap-3 shadow-sm transition-all",
                        session?.status === 'OPEN' ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                            session?.status === 'PAUSED' ? "bg-amber-500/5 text-amber-600 border-amber-500/20" :
                                "bg-rose-500/5 text-rose-600 border-rose-500/20"
                    )}>
                        <div className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor]",
                            session?.status === 'OPEN' ? "bg-emerald-500 animate-pulse" : session?.status === 'PAUSED' ? "bg-amber-500" : "bg-rose-500"
                        )}></div>
                        {session?.status || "OFFLINE"}
                    </div>
                    <div className="h-12 w-[1px] bg-slate-200 dark:bg-slate-800 mx-3 hidden lg:block" />
                    <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/30">
                        <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-xl h-10 w-10 text-slate-400 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 transition-all">
                            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => logout()} className="h-10 w-10 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* LEFT: Controls (8 cols) */}
                <div className="xl:col-span-8 space-y-6">
                    {/* SERVING UNIT CARD */}
                    <Card className="relative overflow-hidden border-2 border-indigo-500/30 shadow-2xl bg-[#020617] dark:bg-slate-950 text-white min-h-[440px] flex flex-col items-center justify-center p-12 rounded-[3.5rem] group transition-all duration-700">
                        {/* Strategic Atmospheric Effects */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-transparent to-emerald-600/20 opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
                        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none group-hover:scale-110 transition-transform duration-1000" />

                        {/* Glow Pulse */}
                        {servingToken && (
                            <div className="absolute inset-0 bg-indigo-500/5 animate-pulse rounded-[3.5rem] pointer-events-none shadow-[inset_0_0_50px_rgba(99,102,241,0.1)]" />
                        )}

                        {/* Scanning Line Animation */}
                        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(99,102,241,0.08)_50%,transparent_100%)] bg-[length:100%_6px] animate-scan opacity-30 pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center w-full h-full">
                            <div className="flex items-center justify-between w-full mb-10">
                                <p className="text-indigo-400 uppercase tracking-[0.4em] text-[10px] font-black flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-pulse" />
                                    Active Processing Node
                                </p>
                                <div className="bg-slate-900/50 border border-white/5 px-4 py-2 rounded-2xl flex items-center gap-2 backdrop-blur-md">
                                    <ActivitySquare className="w-4 h-4 text-emerald-500" />
                                    <span className="text-[9px] font-black tracking-[0.2em] text-slate-300 uppercase">Live Telemetry: Nominal</span>
                                </div>
                            </div>

                            {servingToken ? (
                                <motion.div
                                    key={servingToken.id}
                                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ type: "spring", stiffness: 100 }}
                                    className="text-center w-full"
                                >
                                    <div className="inline-block relative">
                                        <h2 className="text-[150px] md:text-[200px] font-black tracking-tighter leading-none text-white drop-shadow-[0_0_60px_rgba(255,255,255,0.15)] mb-6 selection:bg-indigo-600">
                                            {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                                        </h2>
                                        {servingToken.isPriority && (
                                            <Badge className="absolute -top-6 -right-16 px-6 py-3 bg-rose-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-rose-600/50 border-2 border-white/20 animate-bounce">
                                                EMERGENCY
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="space-y-6">
                                        <h3 className="text-5xl md:text-6xl font-black text-white tracking-tighter uppercase selection:bg-indigo-500">
                                            {servingToken.customerName || 'Intake Patient'}
                                        </h3>
                                        <div className="flex flex-wrap items-center justify-center gap-5">
                                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-xl">
                                                <Smartphone className="w-5 h-5 text-indigo-400" />
                                                <span className="text-indigo-200 font-black text-sm uppercase tracking-widest font-mono">{servingToken.customerPhone}</span>
                                            </div>

                                            {servingToken.doctorId && (
                                                <div className="flex items-center gap-3 bg-indigo-600 px-6 py-3 rounded-2xl shadow-3xl shadow-indigo-600/40 border border-white/10 group-hover:scale-105 transition-transform">
                                                    <UserCheck className="w-5 h-5 text-white" />
                                                    <span className="text-white text-[12px] font-black uppercase tracking-[0.15em]">
                                                        DR. {doctors?.find(d => d.id === servingToken.doctorId)?.name?.toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="text-center py-20 flex flex-col items-center">
                                    <div className="w-32 h-32 bg-slate-900/50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/5 shadow-inner">
                                        <Users className="w-12 h-12 text-slate-700 animate-pulse" />
                                    </div>
                                    <p className="text-9xl font-black text-slate-800/40 tracking-tighter">STANDBY</p>
                                    <p className="mt-6 text-[12px] font-black uppercase tracking-[0.4em] text-indigo-500/60 flex items-center gap-4">
                                        <span className="w-8 h-px bg-indigo-500/20" />
                                        Facility Awaiting Intake
                                        <span className="w-8 h-px bg-indigo-500/20" />
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Status Footer */}
                        <div className="absolute bottom-10 left-12 right-12 flex items-center justify-between z-10 border-t border-white/5 pt-8">
                            <div className="flex items-center gap-8">
                                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                                    <span className="text-emerald-500/80">Stream Integrity: 100%</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                    <Clock className="w-4 h-4 opacity-50" />
                                    <span>Sync: {lastUpdated.toLocaleTimeString()}</span>
                                </div>
                            </div>
                            <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Facility ID: {params.clinicSlug.toUpperCase()}-MASTER</span>
                            </div>
                        </div>
                    </Card>

                    {/* CONTROL CONSOLE */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Button
                            onClick={() => handleNext()}
                            disabled={!isSessionActive || (waitingTokens.length === 0 && !servingToken)}
                            className="md:col-span-2 h-36 text-3xl font-black rounded-[3rem] bg-indigo-600 hover:bg-indigo-500 text-white shadow-3xl shadow-indigo-600/40 active:scale-[0.98] transition-all group overflow-hidden relative border-t-2 border-white/20 border-b-[12px] border-indigo-800"
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex items-center gap-6 relative z-10">
                                {nextLoading ? <Loader2 className="animate-spin w-12 h-12" /> : <PlayCircle className="w-12 h-12" />}
                                <span className="uppercase tracking-tighter">
                                    {waitingTokens.length === 0 && servingToken ? "FINALIZE UNIT" : "EXECUTE NEXT INTAKE"}
                                </span>
                            </div>
                        </Button>

                        <div className="grid grid-cols-2 md:col-span-2 gap-6">
                            <Button
                                variant="outline"
                                onClick={handleSkip}
                                disabled={!servingToken || !isSessionActive}
                                className="h-36 flex flex-col items-center justify-center gap-4 rounded-[3rem] border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-2xl text-slate-900 dark:text-white hover:border-amber-500/50 hover:bg-amber-500/5 active:scale-[0.98] transition-all shadow-xl font-black uppercase tracking-[0.2em] text-[11px] group"
                            >
                                <div className="p-5 bg-amber-500/10 rounded-2xl text-amber-500 group-hover:scale-110 transition-transform shadow-inner">
                                    {skipLoading ? <Loader2 className="animate-spin w-10 h-10" /> : <SkipForward className="w-10 h-10" />}
                                </div>
                                Bypass Unit
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleEmergencyClick}
                                disabled={!isSessionActive}
                                className="h-36 flex flex-col items-center justify-center gap-4 rounded-[3rem] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] transition-all shadow-3xl shadow-rose-600/40 font-black uppercase tracking-[0.2em] text-[11px] border-t-2 border-white/10 border-b-[12px] border-rose-800"
                            >
                                <div className="p-5 bg-white/10 rounded-2xl shadow-inner">
                                    <AlertOctagon className="w-10 h-10" />
                                </div>
                                Emergency
                            </Button>
                        </div>
                    </div>

                    {/* AUXILIARY INSTRUMENTS */}
                    <div className="grid grid-cols-3 gap-6">
                        {isSessionActive ? (
                            <>
                                <Button variant="outline" onClick={handlePauseToggle} className="h-20 font-black rounded-2xl border-2 uppercase tracking-[0.2em] text-[10px] hover:bg-white dark:hover:bg-slate-800 group shadow-sm transition-all">
                                    {session?.status === 'OPEN' ? (
                                        <span className="flex flex-col items-center gap-1"><Moon className="w-5 h-5 text-amber-500 group-hover:scale-110" /> Pause Environment</span>
                                    ) : (
                                        <span className="flex flex-col items-center gap-1"><Sun className="w-5 h-5 text-indigo-500 group-hover:scale-110" /> Resume Environment</span>
                                    )}
                                </Button>
                                <Button variant="ghost" onClick={handleCloseQueue} className="h-20 font-black rounded-2xl text-rose-500 hover:bg-rose-500/10 uppercase tracking-[0.2em] text-[10px] border border-rose-500/30 group">
                                    <span className="flex flex-col items-center gap-1"><XCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" /> TERMINATE SESSION</span>
                                </Button>
                                <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-4 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner group">
                                    <ActivitySquare className="w-5 h-5 text-indigo-500 mb-1 group-hover:animate-pulse" />
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Clinic Throughput</span>
                                    <span className="text-xl font-black text-slate-900 dark:text-white leading-none uppercase tracking-tighter">Normal-Load</span>
                                </div>
                            </>
                        ) : (
                            <Button onClick={handleStartSession} className="col-span-3 h-24 text-2xl font-black rounded-[3rem] bg-emerald-600 hover:bg-emerald-500 shadow-3xl shadow-emerald-600/40 uppercase tracking-[0.3em] text-white border-t-2 border-white/20 border-b-[12px] border-emerald-800">
                                INITIALIZE GLOBAL ORCHESTRATION
                            </Button>
                        )}
                    </div>
                </div>

                {/* RIGHT: Lists (4 cols) */}
                <div className="xl:col-span-4 space-y-6">
                    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={!isSessionActive || isLimitReached} className="w-full h-20 bg-slate-900 border-t-2 border-white/10 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-3xl text-xl font-black shadow-2xl flex items-center justify-center gap-4 group transition-all active:scale-95 border-b-[6px] border-slate-950">
                                <div className="p-2 bg-indigo-500 rounded-xl group-hover:rotate-12 transition-transform">
                                    <UserPlus className="w-6 h-6" />
                                </div>
                                EXECUTE INTAKE
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-0 rounded-[2.5rem] bg-white dark:bg-slate-950 shadow-3xl">
                            <div className="bg-indigo-600 p-8 text-white relative">
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <Zap className="w-24 h-24" />
                                </div>
                                <DialogHeader>
                                    <DialogTitle className="text-3xl font-black uppercase tracking-tighter">New Patient Intake</DialogTitle>
                                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-[0.2em] mt-1">Manual Provisioning Protocol</p>
                                </DialogHeader>
                            </div>

                            <form onSubmit={handleManualAdd} className="p-8 space-y-6">
                                <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/5 shadow-inner">
                                    <div className="flex flex-col">
                                        <Label className="font-black uppercase tracking-widest text-[10px] text-slate-500 mb-1">Priority Override</Label>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">Emergency / VVIP Status</span>
                                    </div>
                                    <Switch checked={manualIsPriority} onCheckedChange={setManualIsPriority} className="data-[state=checked]:bg-rose-500" />
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    {departments && departments.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="font-black uppercase tracking-widest text-[10px] text-slate-500 ml-1">Intake Routing (Department)</Label>
                                            <div className="relative group">
                                                <select
                                                    value={manualDepartmentId}
                                                    onChange={(e) => {
                                                        setManualDepartmentId(e.target.value);
                                                        setManualDoctorId("any");
                                                    }}
                                                    className="w-full h-14 rounded-2xl border-2 border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm font-bold appearance-none focus:border-indigo-500/50 transition-all outline-none"
                                                >
                                                    <option value="any">General Ward / System Routed</option>
                                                    {departments.map(d => (
                                                        <option key={d.id} value={d.id}>{d.name.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-4 top-4.5 w-5 h-5 text-slate-400 pointer-events-none group-focus-within:rotate-180 transition-transform" />
                                            </div>
                                        </div>
                                    )}

                                    {manualDepartmentId !== "any" && (
                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                                            <Label className="font-black uppercase tracking-widest text-[10px] text-slate-500 ml-1">Target Personnel (Doctor)</Label>
                                            <select
                                                value={manualDoctorId}
                                                onChange={(e) => setManualDoctorId(e.target.value)}
                                                className="w-full h-14 rounded-2xl border-2 border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm font-bold appearance-none transition-all outline-none focus:border-indigo-500/50"
                                            >
                                                <option value="any">AUTOBALANCE (Least Busy First)</option>
                                                {doctors
                                                    .filter(d => d.department_id === manualDepartmentId)
                                                    .map(d => {
                                                        const docTokens = tokens.filter(t => t.doctorId === d.id);
                                                        const load = docTokens.filter(t => t.status === 'WAITING' || t.status === 'WAITING_LATE').length;
                                                        return { ...d, load };
                                                    })
                                                    .sort((a, b) => a.load - b.load)
                                                    .map(d => (
                                                        <option key={d.id} value={d.id}>
                                                            DR. {d.name.toUpperCase()} ({d.load} WAITING)
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </motion.div>
                                    )}

                                    <div className="space-y-2">
                                        <Label className="font-black uppercase tracking-widest text-[10px] text-slate-500 ml-1">Identity Information</Label>
                                        <div className="space-y-3">
                                            <div className="relative">
                                                <Users className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                                                <Input
                                                    value={manualName}
                                                    onChange={e => setManualName(e.target.value)}
                                                    placeholder="FULL NAME"
                                                    className="h-14 pl-12 rounded-2xl border-2 bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-white/5 font-bold md:text-base focus:border-indigo-500/50"
                                                />
                                            </div>
                                            <div className="relative">
                                                <Smartphone className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
                                                <Input
                                                    value={manualPhone}
                                                    onChange={e => setManualPhone(e.target.value)}
                                                    placeholder="CONTACT NUMBER"
                                                    className="h-14 pl-12 rounded-2xl border-2 bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-white/5 font-bold md:text-base focus:border-indigo-500/50"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={addLoading}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-indigo-600/30 transition-all active:scale-95 text-xs border-b-4 border-indigo-800"
                                >
                                    {addLoading ? <Loader2 className="animate-spin mr-2" /> : <UserPlus className="mr-3 w-5 h-5" />}
                                    Finalize Intake Protocol
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* QUEUE ORCHESTRATION LIST */}
                    <Card className="flex flex-col h-[600px] bg-white dark:bg-slate-900/50 backdrop-blur-xl border-2 border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
                        <div className="p-6 bg-slate-50/50 dark:bg-slate-900 border-b-2 border-slate-100 dark:border-white/5 flex justify-between items-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-indigo-500" />
                                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-lg">Unit Orchestration</h3>
                                <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2" />
                                <select
                                    value={filterDoctorId}
                                    onChange={(e) => setFilterDoctorId(e.target.value)}
                                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-indigo-600 outline-none cursor-pointer"
                                >
                                    <option value="all">Global Queue</option>
                                    {doctors?.map(d => (
                                        <option key={d.id} value={d.id}>Dr. {d.name.split(' ')[0]}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge className="bg-slate-900 dark:bg-indigo-500 text-white font-black px-3 py-1 rounded-xl shadow-lg">{waitingTokens.length} {filterDoctorId === 'all' ? 'TOTAL' : 'TARGET'} WAITING</Badge>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {visibleWaitingTokens.map(t => {
                                const deptName = departments?.find(d => d.id === t.departmentId)?.name;
                                const docName = doctors?.find(d => d.id === t.doctorId)?.name;
                                return (
                                    <TokenItem
                                        key={t.id}
                                        token={t}
                                        onCancel={handleCancelToken}
                                        onToggleArrived={handleToggleArrived}
                                        isCallLoading={nextLoading || skipLoading}
                                        departmentName={deptName}
                                        doctorName={docName}
                                    />
                                );
                            })}
                            {visibleWaitingTokens.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-32 text-slate-400 group">
                                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 dark:border-white/5 group-hover:scale-110 transition-transform duration-500">
                                        <Users className="w-10 h-10 opacity-20" />
                                    </div>
                                    <p className="font-black uppercase tracking-[0.2em] text-[10px] opacity-40">Orchestration Buffer Empty</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* SKIPPED UNITS BUFFER */}
                    {skippedTokens.length > 0 && (
                        <Card className="p-4 border-2 border-amber-500/20 rounded-[2.5rem] bg-amber-500/5 backdrop-blur-md relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <SkipForward className="w-12 h-12" />
                            </div>
                            <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 px-2">
                                <Zap className="w-3 h-3" /> Skipped Execution Log
                            </div>
                            <div className="space-y-2">
                                {skippedTokens.map(t => (
                                    <div key={t.id} className="flex justify-between items-center p-3 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-amber-500/10 hover:border-amber-500/30 transition-all group/item">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center font-black text-amber-600 dark:text-amber-400 text-sm">
                                                {formatToken(t.tokenNumber, t.isPriority)}
                                            </div>
                                            <span className="font-black text-xs text-slate-700 dark:text-slate-300 uppercase tracking-tighter">
                                                {t.customerName?.split(' ')[0] || 'Unknown'}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl transition-all"
                                            onClick={() => handleRecall(t.id)}
                                        >
                                            RECALL UNIT
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* DOCTOR RESOURCE LOAD HEATMAP */}
                    <DoctorLoadPanel
                        doctors={doctors || []}
                        tokens={tokens || []}
                    />
                </div>
            </div>

            {/* HISTORICAL AUDIT & PATIENT LOG */}
            <div className="mt-12 group">
                <Card className="border-2 border-slate-200 dark:border-white/5 rounded-[3rem] overflow-hidden shadow-2xl bg-white dark:bg-slate-900/50 backdrop-blur-2xl transition-all duration-500">
                    <div
                        className="p-8 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors relative"
                        onClick={() => setIsLogOpen(!isLogOpen)}
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/20" />
                        <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Users className="w-7 h-7" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Daily Operations Audit</h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-1">Cross-Reference & Historical Interaction Log</p>
                            </div>
                            <Badge className="ml-4 bg-indigo-500 text-white font-black px-3 py-1 rounded-xl shadow-lg border-2 border-white/10">{displayedTokens.length} ENTRIES</Badge>
                        </div>
                        {isLogOpen ? <ChevronUp className="w-6 h-6 text-slate-400" /> : <ChevronDown className="w-6 h-6 text-slate-400" />}
                    </div>

                    <AnimatePresence>
                        {isLogOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t-2 border-slate-100 dark:border-white/5 overflow-hidden"
                            >
                                <div className="p-8 bg-slate-50 dark:bg-[#0B1120] flex flex-wrap gap-6 items-center justify-between">
                                    <div className="flex flex-wrap gap-4 items-center flex-1">
                                        <div className="relative flex-1 min-w-[300px]">
                                            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                                            <Input
                                                placeholder="SEARCH BY PATIENT IDENTITY OR IDENTIFIER..."
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                className="h-12 pl-12 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-white/5 font-black text-xs uppercase focus:border-indigo-500/50"
                                            />
                                        </div>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            max={todayStr}
                                            onChange={e => setSelectedDate(e.target.value)}
                                            className="w-48 h-12 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-white/5 font-black text-xs"
                                        />
                                        <Button variant="outline" className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] border-2 border-indigo-500/20 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-md active:scale-95 flex gap-2 items-center" onClick={async () => {
                                            // CSV Export
                                            showToast("Compiling Encrypted Transfer...", "success");
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
                                                link.setAttribute("download", `AUDIT_${cleanClinicName}_${cleanDate}.csv`);
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                URL.revokeObjectURL(url);
                                                showToast("Audit Log Exported", "success");
                                            }
                                        }}>
                                            <LogOut className="w-4 h-4 rotate-90" /> Export System Audit (CSV)
                                        </Button>
                                    </div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3 bg-slate-200 dark:bg-slate-900 px-4 py-2 rounded-xl">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> Served: {totalServedCount}
                                    </div>
                                </div>

                                <div className="max-h-[500px] overflow-y-auto overflow-x-auto custom-scrollbar">
                                    {historyLoading ? (
                                        <div className="py-32 flex flex-col items-center justify-center gap-4">
                                            <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
                                            <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Decrypting Operations Log...</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead className="bg-slate-50 dark:bg-slate-900 border-b-2 border-slate-100 dark:border-white/5 text-slate-400 uppercase text-[9px] font-black tracking-[0.2em] sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-8 py-5">Identifier</th>
                                                    <th className="px-8 py-5">Subject Identity</th>
                                                    <th className="px-8 py-5">Access Device</th>
                                                    <th className="px-8 py-5">Operational Routing</th>
                                                    <th className="px-8 py-5">Post-Intake Feedback</th>
                                                    <th className="px-8 py-5 text-right">Unit Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y-2 divide-slate-50 dark:divide-white/5">
                                                {displayedTokens
                                                    .filter(t =>
                                                        (t.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                                                        (t.customerPhone || "").includes(searchTerm)
                                                    )
                                                    .map(t => (
                                                        <tr key={t.id} className="hover:bg-indigo-500/5 transition-colors group/row">
                                                            <td className="px-8 py-6">
                                                                <div className="flex flex-col">
                                                                    <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm tracking-tighter">
                                                                        {formatToken(t.tokenNumber, t.isPriority)}
                                                                    </span>
                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">INT-ID: {t.id.slice(0, 8)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-xs font-black text-slate-500">
                                                                        {t.customerName?.charAt(0).toUpperCase() || '?'}
                                                                    </div>
                                                                    <span className="font-black text-[13px] text-slate-900 dark:text-white uppercase tracking-tighter group-hover/row:translate-x-1 transition-transform">{t.customerName || '—'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
                                                                    <Smartphone className="w-3.5 h-3.5 opacity-50" />
                                                                    {t.customerPhone || '—'}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex flex-col gap-1.5">
                                                                    {t.departmentId ? <Badge variant="outline" className="w-fit text-[8px] font-black uppercase tracking-widest border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/50">{departments?.find(d => d.id === t.departmentId)?.name || 'General'}</Badge> : null}
                                                                    {t.doctorId ? (
                                                                        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                                                                            <RefreshCw className="w-3 h-3" /> Dr. {doctors?.find(d => d.id === t.doctorId)?.name}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6 max-w-xs">
                                                                <div className="text-xs italic text-slate-500 dark:text-slate-400 group-hover/row:text-slate-900 dark:group-hover/row:text-slate-200 transition-colors">
                                                                    {t.feedback ? <>&ldquo;{t.feedback}&rdquo;</> : "—"}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex items-center justify-end gap-3 px-4">
                                                                    <Badge className={cn("text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1 rounded-lg border-2",
                                                                        t.status === 'SERVED' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                                            t.status === 'CANCELLED' ? "bg-rose-500/10 text-rose-600 border-rose-500/20 line-through" :
                                                                                "bg-slate-100 text-slate-600 border-slate-200"
                                                                    )}>
                                                                        {t.status}
                                                                    </Badge>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-10 w-10 text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-xl"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setTimelineTokenId(t.id);
                                                                        }}
                                                                    >
                                                                        <Activity className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {hasMoreHistory && !historyLoading && (
                                        <div className="p-12 flex justify-center border-t-2 border-slate-50 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => fetchLog(true)}
                                                className="h-12 px-10 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] border-2 border-indigo-500/30 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all shadow-xl shadow-indigo-600/10"
                                            >
                                                Retrieve Legacy Records
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>
            </div>

            {editingToken && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm p-6 rounded-3xl shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <Pencil className="text-blue-600" />
                            <h3 className="text-xl font-bold">Edit Patient</h3>
                        </div>
                        <div className="space-y-4">
                            <Input
                                value={editingToken.name}
                                onChange={e => setEditingToken(prev => prev ? { ...prev, name: e.target.value } : null)}
                                placeholder="Name"
                            />
                            <Input
                                value={editingToken.phone}
                                onChange={e => setEditingToken(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                placeholder="Phone"
                            />
                            <div className="flex gap-2 pt-4">
                                <Button variant="ghost" className="flex-1" onClick={() => setEditingToken(null)}>Cancel</Button>
                                <Button className="flex-1 bg-blue-600" onClick={handleSaveEdit}>Save</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            <Dialog open={!!timelineTokenId} onOpenChange={(open) => !open && setTimelineTokenId(null)}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black mb-2">Patient Timeline</DialogTitle>
                    </DialogHeader>
                    {timelineTokenId && <VisitTimeline visitId={timelineTokenId} />}
                </DialogContent>
            </Dialog>

            {toast && (
                <div className={cn(
                    "fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-bottom-5",
                    toast.type === 'success' ? "bg-slate-900 text-white" : "bg-red-600 text-white"
                )}>
                    <span className="font-bold text-sm tracking-wide">{toast.message}</span>
                </div>
            )}
        </div >
    );
}
