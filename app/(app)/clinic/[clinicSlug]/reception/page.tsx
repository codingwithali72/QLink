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
import {
    Loader2, SkipForward, Users, AlertOctagon, LogOut, PlayCircle,
    Moon, Sun, ChevronDown, ChevronUp, Search, Pencil,
    Activity, Smartphone, UserPlus, UserCheck, Clock, XCircle
} from "lucide-react";
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
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] transition-colors duration-300 p-4 md:p-8 font-sans relative">
            {showOfflineError && (
                <div className="fixed top-0 left-0 w-full bg-rose-500 text-white text-center text-[10px] py-1.5 font-bold z-[100] animate-in slide-in-from-top-full">
                    Reconnecting to live updates...
                </div>
            )}

            {stallMinutes >= 5 && servingToken && session?.status === 'OPEN' && (
                <div className={`fixed top-0 left-0 w-full text-white text-center text-xs py-2 font-bold z-50 animate-pulse flex items-center justify-center gap-2 ${stallMinutes >= 10 ? 'bg-red-600' : 'bg-amber-500'}`}>
                    <AlertOctagon className="w-3.5 h-3.5" />
                    Queue stalled — {stallMinutes} min since last advance
                </div>
            )}

            {/* CLINICAL HEADER */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900 px-8 py-6 rounded-3xl mb-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-5">
                    <div className="h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-600/20">Q</div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Reception Desk</h1>
                        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                            <span className="text-indigo-600">{params.clinicSlug}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>{todayDate}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-2",
                        session?.status === 'OPEN' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            session?.status === 'PAUSED' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-rose-50 text-rose-700 border-rose-200"
                    )}>
                        <div className={cn("w-2 h-2 rounded-full",
                            session?.status === 'OPEN' ? "bg-emerald-500 animate-pulse" : session?.status === 'PAUSED' ? "bg-amber-500" : "bg-rose-500"
                        )}></div>
                        {session?.status || "OFFLINE"}
                    </div>
                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden lg:block" />
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-xl h-10 w-10 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                            {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-500" />}
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => logout()} className="h-10 w-10 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* LEFT: Controls (8 cols) */}
                <div className="xl:col-span-8 space-y-6">
                    {/* NOW SERVING CARD */}
                    <Card className="relative overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[400px] flex flex-col p-10 rounded-3xl shadow-sm">
                        <div className="flex items-center justify-between w-full mb-8">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Active Session</p>
                            </div>
                            {servingToken && (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[9px] font-bold tracking-wider px-3 py-1">In Consult</Badge>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col items-center justify-center">
                            {servingToken ? (
                                <motion.div
                                    key={servingToken.id}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center"
                                >
                                    <div className="relative inline-block mb-4">
                                        <h2 className="text-8xl md:text-9xl font-black text-slate-900 dark:text-white tracking-tighter">
                                            {formatToken(servingToken.tokenNumber, servingToken.isPriority)}
                                        </h2>
                                        {servingToken.isPriority && (
                                            <div className="absolute -top-4 -right-8 bg-rose-600 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-lg">EMERGENCY</div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
                                            {servingToken.customerName || 'Standard Patient'}
                                        </h3>
                                        <div className="flex items-center justify-center gap-4">
                                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                                <Smartphone className="w-4 h-4 text-slate-400" />
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono tracking-tight">{servingToken.customerPhone}</span>
                                            </div>
                                            {servingToken.doctorId && (
                                                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                                                    <UserCheck className="w-4 h-4 text-indigo-600" />
                                                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
                                                        Dr. {doctors?.find(d => d.id === servingToken.doctorId)?.name}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 mx-auto border border-slate-100 dark:border-slate-700">
                                        <Users className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-3xl font-bold text-slate-300 uppercase tracking-widest italic">Standby Mode</p>
                                    <p className="text-sm text-slate-400 font-medium mt-2">Ready to process next patient</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-5">
                                <span className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Connection
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Sync: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{params.clinicSlug.toUpperCase()}-01</span>
                        </div>
                    </Card>

                    {/* ACTION CONSOLE */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Button
                            onClick={() => handleNext()}
                            disabled={!isSessionActive || (waitingTokens.length === 0 && !servingToken)}
                            className="md:col-span-2 h-32 text-2xl font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1"
                        >
                            <div className="flex items-center gap-4">
                                {nextLoading ? <Loader2 className="animate-spin w-8 h-8" /> : <PlayCircle className="w-8 h-8" />}
                                <span className="tracking-tight italic uppercase">
                                    {waitingTokens.length === 0 && servingToken ? "Close Visit" : "Call Next Patient"}
                                </span>
                            </div>
                        </Button>

                        <div className="grid grid-cols-2 md:col-span-2 gap-4">
                            <Button
                                variant="outline"
                                onClick={handleSkip}
                                disabled={!servingToken || !isSessionActive}
                                className="h-32 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-white hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-200 transition-all group"
                            >
                                <div className="p-3 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 group-hover:scale-110 transition-transform">
                                    {skipLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <SkipForward className="w-6 h-6" />}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Skip Patient</span>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleEmergencyClick}
                                disabled={!isSessionActive}
                                className="h-32 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-white hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:border-rose-200 transition-all group"
                            >
                                <div className="p-3 bg-rose-100 dark:bg-rose-900/40 rounded-xl text-rose-600 group-hover:scale-110 transition-transform">
                                    <AlertOctagon className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Emergency</span>
                            </Button>
                        </div>
                    </div>

                    {/* SECONDARY CONTROLS */}
                    <div className="grid grid-cols-3 gap-6">
                        {isSessionActive ? (
                            <>
                                <Button variant="ghost" onClick={handlePauseToggle} className="h-20 font-bold rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 transition-all">
                                    {session?.status === 'OPEN' ? (
                                        <div className="flex flex-col items-center gap-1.5"><Moon className="w-5 h-5 text-amber-500" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Pause Queue</span></div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1.5"><Sun className="w-5 h-5 text-indigo-600" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Resume Queue</span></div>
                                    )}
                                </Button>
                                <Button variant="ghost" onClick={handleCloseQueue} className="h-20 font-bold rounded-2xl border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all">
                                    <div className="flex flex-col items-center gap-1.5"><XCircle className="w-5 h-5" /><span className="text-[10px] uppercase tracking-wider">End Session</span></div>
                                </Button>
                                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Clinic Load</span>
                                    <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none px-3 py-0.5 text-[10px] font-bold uppercase">Optimal</Badge>
                                </div>
                            </>
                        ) : (
                            <Button onClick={handleStartSession} className="col-span-3 h-20 text-xl font-bold rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 text-white uppercase tracking-widest border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1">
                                Start Today&apos;s Queue
                            </Button>
                        )}
                    </div>
                </div>

                {/* RIGHT: Lists (4 cols) */}
                <div className="xl:col-span-4 space-y-6">
                    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={!isSessionActive || isLimitReached} className="w-full h-16 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-2xl text-lg font-bold shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95 border-b-4 border-slate-950">
                                <UserPlus className="w-5 h-5" />
                                Add Patient
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none rounded-3xl bg-white dark:bg-slate-950 shadow-2xl">
                            <div className="bg-indigo-600 p-8 text-white">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold">New Patient Entry</DialogTitle>
                                    <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mt-1.5">Manual intake for clinic walk-ins</p>
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

                    {/* PATIENT QUEUE LIST */}
                    <Card className="flex flex-col h-[600px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">Queue List</h3>
                                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                                <select
                                    value={filterDoctorId}
                                    onChange={(e) => setFilterDoctorId(e.target.value)}
                                    className="bg-transparent text-[10px] font-bold uppercase tracking-widest text-indigo-600 outline-none cursor-pointer"
                                >
                                    <option value="all">Consolidated Queue</option>
                                    {doctors?.map(d => (
                                        <option key={d.id} value={d.id}>Dr. {d.name.split(' ')[0]}</option>
                                    ))}
                                </select>
                            </div>
                            <Badge className="bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-300 font-bold px-3 py-0.5 rounded-full text-[10px]">{waitingTokens.length} WAITING</Badge>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {visibleWaitingTokens.map(t => {
                                const docName = doctors?.find(d => d.id === t.doctorId)?.name;
                                return (
                                    <TokenItem
                                        key={t.id}
                                        token={t}
                                        onCancel={handleCancelToken}
                                        onToggleArrived={handleToggleArrived}
                                        isCallLoading={nextLoading || skipLoading}
                                        doctorName={docName}
                                    />
                                );
                            })}
                            {visibleWaitingTokens.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-800">
                                        <Users className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p className="font-medium text-xs">No active tokens</p>
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
                                <Activity className="w-3 h-3" /> Skipped Execution Log
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

            {/* PATIENT LOG & HISTORY */}
            <div className="mt-12">
                <Card className="border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 transition-all duration-300">
                    <div
                        className="p-6 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        onClick={() => setIsLogOpen(!isLogOpen)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Patient Activity Log</h3>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Review historical records and consult details</p>
                            </div>
                            <Badge className="ml-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold px-3 py-0.5 rounded-full text-[10px]">{displayedTokens.length} ENTRIES</Badge>
                        </div>
                        {isLogOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>

                    <AnimatePresence>
                        {isLogOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t-2 border-slate-100 dark:border-white/5 overflow-hidden"
                            >
                                <div className="p-6 bg-slate-50/50 dark:bg-slate-900 flex flex-wrap gap-4 items-center justify-between border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-wrap gap-4 items-center flex-1">
                                        <div className="relative flex-1 min-w-[280px]">
                                            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Search by name or phone..."
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                className="h-9 pl-10 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                                            />
                                        </div>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            max={todayStr}
                                            onChange={e => setSelectedDate(e.target.value)}
                                            className="w-40 h-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-bold"
                                        />
                                        <Button variant="outline" className="h-9 px-4 rounded-xl font-bold uppercase tracking-wider text-[9px] border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex gap-2 items-center" onClick={async () => {
                                            // CSV Export
                                            showToast("Preparing Export...", "success");
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
                                                showToast("Export Complete", "success");
                                            }
                                        }}>
                                            <LogOut className="w-3.5 h-3.5 rotate-90" /> Export CSV
                                        </Button>
                                    </div>
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <span>Total Served: {totalServedCount}</span>
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
                                            <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[8px] font-bold tracking-widest sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-6 py-4">Token</th>
                                                    <th className="px-6 py-4">Patient Name</th>
                                                    <th className="px-6 py-4">Contact</th>
                                                    <th className="px-6 py-4">Assignment</th>
                                                    <th className="px-6 py-4">Feedback</th>
                                                    <th className="px-6 py-4 text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                {displayedTokens
                                                    .filter(t =>
                                                        (t.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                                                        (t.customerPhone || "").includes(searchTerm)
                                                    )
                                                    .map(t => (
                                                        <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group/row">
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                                                                        {formatToken(t.tokenNumber, t.isPriority)}
                                                                    </span>
                                                                    <span className="text-[7px] font-bold text-slate-300 uppercase mt-0.5">#{t.id.slice(0, 6)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="font-bold text-xs text-slate-700 dark:text-slate-200 uppercase tracking-tight">{t.customerName || '—'}</span>
                                                            </td>
                                                            <td className="px-6 py-4 pb-1">
                                                                <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px]">
                                                                    {t.customerPhone || '—'}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-1">
                                                                    {t.departmentId ? <span className="text-[9px] font-bold text-slate-500">{departments?.find(d => d.id === t.departmentId)?.name || 'General'}</span> : null}
                                                                    {t.doctorId ? (
                                                                        <span className="text-[9px] font-bold text-indigo-500">
                                                                            Dr. {doctors?.find(d => d.id === t.doctorId)?.name}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 max-w-xs">
                                                                <div className="text-[10px] italic text-slate-400">
                                                                    {t.feedback ? <>&ldquo;{t.feedback}&rdquo;</> : "—"}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Badge className={cn("text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-none",
                                                                        t.status === 'SERVED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                                            t.status === 'CANCELLED' ? "bg-rose-50 text-rose-700 border-rose-100 line-through" :
                                                                                "bg-slate-50 text-slate-600 border-slate-100"
                                                                    )}>
                                                                        {t.status}
                                                                    </Badge>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-indigo-600 hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); setTimelineTokenId(t.id); }}>
                                                                        <Activity className="w-3.5 h-3.5" />
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm p-8 rounded-3xl shadow-2xl border-none">
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
                                <Pencil className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Edit Patient Info</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Patient Name</Label>
                                <Input
                                    value={editingToken.name}
                                    onChange={e => setEditingToken(prev => prev ? { ...prev, name: e.target.value } : null)}
                                    className="h-11 rounded-xl border-slate-200 text-sm font-bold"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Contact Number</Label>
                                <Input
                                    value={editingToken.phone}
                                    onChange={e => setEditingToken(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                    className="h-11 rounded-xl border-slate-200 text-sm font-bold"
                                />
                            </div>
                            <div className="flex gap-3 pt-6">
                                <Button variant="ghost" className="flex-1 h-11 font-bold text-slate-500" onClick={() => setEditingToken(null)}>Cancel</Button>
                                <Button className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 font-bold" onClick={handleSaveEdit}>Save Changes</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            <Dialog open={!!timelineTokenId} onOpenChange={(open) => !open && setTimelineTokenId(null)}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-3xl p-8 border-none shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold mb-4">Visit Timeline</DialogTitle>
                    </DialogHeader>
                    {timelineTokenId && <VisitTimeline visitId={timelineTokenId} />}
                </DialogContent>
            </Dialog>

            {toast && (
                <div className={cn(
                    "fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full shadow-lg z-[200] animate-in slide-in-from-bottom-4 flex items-center gap-3",
                    toast.type === 'success' ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
                )}>
                    <div className={cn("w-1.5 h-1.5 rounded-full", toast.type === 'success' ? "bg-emerald-400" : "bg-white")}></div>
                    <span className="font-bold text-xs tracking-tight">{toast.message}</span>
                </div>
            )}
        </div >
    );
}
