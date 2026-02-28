"use client";

import { cancelToken, confirmArrival, getPublicTokenStatus, submitFeedback } from "@/app/actions/queue";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, XCircle, Clock, Star, Info, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

// ⭐ Google Reviews link
const GOOGLE_REVIEW_URL = "https://www.google.com/search?q=prime+care+clinic+mumbai+reviews";

export default function TicketPage({ params }: { params: { clinicSlug: string; tokenId: string } }) {
    const [actionLoading, setActionLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [feedbackText, setFeedbackText] = useState("");
    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
    const [feedbackLoading, setFeedbackLoading] = useState(false);

    // Polling State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tokenData, setTokenData] = useState<any>(null);
    const [tokensAhead, setTokensAhead] = useState(0);
    const [currentServingDisplay, setCurrentServingDisplay] = useState("--");
    const [loading, setLoading] = useState(true);
    const [syncError, setSyncError] = useState(false);

    const prevTokensAheadRef = useRef<number | null>(null);
    const [queueAlert, setQueueAlert] = useState<{ type: 'fast' | 'next' | 'shifted'; msg: string } | null>(null);

    const fetchStatus = useCallback(async () => {
        if (isOffline) return;
        try {
            const res = await getPublicTokenStatus(params.tokenId);
            if (res.success && res.data) {
                const newAhead = res.data.tokens_ahead;
                const prev = prevTokensAheadRef.current;

                if (prev !== null && res.data.token.status === 'WAITING') {
                    const delta = prev - newAhead;
                    if (newAhead === 0) {
                        setQueueAlert({ type: 'next', msg: '🔔 You are NEXT. Please come to the reception counter now.' });
                        if (navigator?.vibrate) navigator.vibrate([300, 100, 300]);
                    } else if (delta >= 3) {
                        setQueueAlert({ type: 'fast', msg: `⚡ Queue moved faster than expected. You are now ${newAhead} ahead.` });
                    } else if (delta < 0) {
                        setQueueAlert({ type: 'shifted', msg: 'ℹ️ A priority case was added. Your position shifted.' });
                    }
                }
                prevTokensAheadRef.current = newAhead;

                setTokenData(res.data.token);
                setTokensAhead(newAhead);
                setCurrentServingDisplay(res.data.current_serving);
                setSyncError(false);
            } else {
                setSyncError(true);
            }
        } catch (error) {
            console.error(error);
            setSyncError(true);
        } finally {
            setLoading(false);
        }
    }, [params.tokenId, isOffline]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchStatus();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchStatus]);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-cloud-dancer dark:bg-[#0B1120]">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4 opacity-20" />
                <p className="text-sm font-black text-indigo-900/30 uppercase tracking-[0.3em]">Patient Concierge</p>
            </div>
        );
    }

    if (syncError || !tokenData) {
        return <div className="p-8 text-center mt-10 text-slate-500 font-medium bg-cloud-dancer dark:bg-[#0B1120] min-h-screen">Ticket session expired or not found.</div>;
    }

    const handleSubmitFeedback = async (e?: React.FormEvent, submitRating?: number) => {
        if (e) e.preventDefault();
        const activeRating = submitRating || rating;
        if (!activeRating) return;
        setFeedbackLoading(true);
        await submitFeedback(params.tokenId, activeRating, feedbackText);
        setFeedbackLoading(false);
        setFeedbackSubmitted(true);
        if (activeRating >= 4) {
            setTimeout(() => window.open(GOOGLE_REVIEW_URL, "_blank"), 800);
        }
    };

    const handleCancel = async () => {
        if (!confirm("Are you sure you want to cancel your visit?")) return;
        setActionLoading(true);
        const res = await cancelToken(params.clinicSlug, params.tokenId);
        if (res.error) alert("Error: " + res.error);
        else fetchStatus();
        setActionLoading(false);
    };

    const handleConfirmArrival = async () => {
        setActionLoading(true);
        const res = await confirmArrival(params.clinicSlug, params.tokenId);
        if (res.error) alert("Error: " + res.error);
        else fetchStatus();
        setActionLoading(false);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `QLink Token: ${formatToken(tokenData.token_number, tokenData.is_priority)}`,
                    text: `Track my clinical queue position at ${params.clinicSlug}`,
                    url: window.location.href,
                });
            } catch { /* Fail silent */ }
        } else {
            await navigator.clipboard.writeText(window.location.href);
            alert("Tracking link copied!");
        }
    };

    const isServing = tokenData.status === "SERVING";
    const isDone = tokenData.status === "SERVED";
    const isCancelled = tokenData.status === "CANCELLED";
    const isSkipped = tokenData.status === "SKIPPED";
    const isPriority = tokenData.is_priority;

    const minMins = tokensAhead * 8;
    const maxMins = tokensAhead * 15;
    let etaText = "";
    if (tokensAhead === 0 && !isServing) etaText = "Next Up";
    else if (isServing) etaText = "Inside Now";
    else if (minMins > 90) etaText = `~${Math.round(minMins / 60)}h ${minMins % 60}m`;
    else etaText = `${minMins}–${maxMins} min`;

    // Visual Config
    let themeBg = "bg-indigo-600";
    let statusLabel = "In Web-Queue";
    if (isServing) { themeBg = "bg-emerald-600"; statusLabel = "Now Serving"; }
    if (isPriority) { themeBg = "bg-indigo-700"; statusLabel = "Priority Case"; }
    if (isDone) { themeBg = "bg-slate-900"; statusLabel = "Visit Complete"; }
    if (isCancelled) { themeBg = "bg-slate-500"; statusLabel = "Cancelled"; }

    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-indigo-500/30 flex flex-col items-center p-6 pt-12 sm:pt-20">

            {/* Real-time Status Banner */}
            {isOffline && (
                <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center z-50">
                    Offline • Sync Suspended
                </div>
            )}

            {queueAlert && (
                <div
                    className="fixed top-4 left-4 right-4 bg-white dark:bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-top-10 duration-500 flex items-center gap-4 cursor-pointer"
                    onClick={() => setQueueAlert(null)}
                >
                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/20">
                        <Info className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{queueAlert.msg}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Tap to dismiss</p>
                    </div>
                </div>
            )}

            {/* THE TOKEN CARD */}
            <div className={`w-full max-w-md bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl shadow-indigo-900/10 dark:shadow-black/50 overflow-hidden transition-all duration-700 ${isServing ? 'ring-8 ring-emerald-500/20 scale-105' : 'scale-100'}`}>

                {/* Branding & Status Header */}
                <div className={`p-10 ${themeBg} text-white transition-colors duration-700 relative overflow-hidden`}>
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>

                    {isServing && (
                        <>
                            <div className="absolute inset-0 bg-emerald-400/20 animate-pulse pointer-events-none" />
                            <div className="absolute -inset-2 bg-gradient-to-r from-emerald-400/0 via-white/30 to-emerald-400/0 skew-x-12 animate-shimmer pointer-events-none" />
                        </>
                    )}

                    <div className="flex justify-between items-start mb-10 relative z-10">
                        <div className="h-10 w-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center font-black text-xl border border-white/20 shadow-inner">Q</div>
                        <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                            Live Sync
                        </div>
                    </div>

                    <div className="text-center space-y-2 relative z-10">
                        <p className="text-xs font-black uppercase tracking-[0.4em] opacity-60">{statusLabel}</p>
                        <h1 className="text-[7rem] font-black tracking-tighter leading-none mb-2 drop-shadow-xl">{formatToken(tokenData.token_number, tokenData.is_priority)}</h1>
                        <p className="text-sm font-bold opacity-80 backdrop-blur-sm bg-white/10 inline-block px-4 py-1 rounded-full border border-white/10">{params.clinicSlug}</p>
                    </div>
                </div>

                <div className="p-10 bg-white dark:bg-slate-900 space-y-10">

                    {/* Live Counter Info */}
                    {!isDone && !isCancelled && !isSkipped && (
                        <div className="grid grid-cols-2 gap-6">
                            <div className="text-center group">
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Progress</p>
                                <div className="text-4xl font-black text-slate-900 dark:text-white tabular-nums group-hover:scale-110 transition-transform">{currentServingDisplay}</div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Current</p>
                            </div>
                            <div className="text-center group">
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Remaining</p>
                                <div className="text-4xl font-black text-indigo-600 tabular-nums group-hover:scale-110 transition-transform">{tokensAhead}</div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{tokensAhead === 0 ? 'Next' : 'Ahead'}</p>
                            </div>
                        </div>
                    )}

                    {/* Serving Destination */}
                    {isServing && tokenData.room_number && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-100 dark:border-emerald-900/50 p-8 rounded-[2rem] text-center space-y-3 animate-in fade-in zoom-in duration-500">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                            <h3 className="text-xl font-black text-emerald-900 dark:text-emerald-300">Proceed to Consultation</h3>
                            <div className="text-5xl font-black text-emerald-600 tracking-tighter uppercase">{tokenData.room_number}</div>
                        </div>
                    )}

                    {/* Wait Time Indicator & Arrival Action */}
                    {!isDone && !isServing && !isCancelled && (
                        <div className="bg-slate-50 dark:bg-slate-800/10 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-inner border border-slate-100 dark:border-white/5">
                                        <Clock className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <span className="text-lg font-black text-slate-900 dark:text-white">Est. Wait Time</span>
                                </div>
                                <div className="text-2xl font-black text-indigo-600 tabular-nums">{etaText}</div>
                            </div>

                            {!tokenData.is_arrived && (
                                <Button
                                    onClick={handleConfirmArrival}
                                    disabled={actionLoading}
                                    className="w-full h-16 rounded-[1.5rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 animate-bounce"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin" /> : "I'm at the Clinic"}
                                </Button>
                            )}

                            <div className="relative h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-1000"
                                    style={{ width: `${Math.max(5, 100 - (tokensAhead * 10))}%` }}
                                ></div>
                            </div>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                                {tokenData.is_arrived
                                    ? "Your arrival is confirmed. Please stay within range of the counter."
                                    : "Please tap the button above when you physically reach the clinic premises."}
                            </p>
                        </div>
                    )}

                    {/* COMPLETED: Patient Survey */}
                    {isDone && (
                        <div className="text-center space-y-8 py-4">
                            {!feedbackSubmitted ? (
                                <>
                                    <div className="space-y-2">
                                        <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                        </div>
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Visit Completed</h2>
                                        <p className="text-sm font-medium text-slate-500">How was your experience today?</p>
                                    </div>
                                    <div className="flex justify-center gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => {
                                                    setRating(s);
                                                    if (s >= 4) setTimeout(() => handleSubmitFeedback(undefined, s), 400);
                                                }}
                                                onMouseEnter={() => setHoverRating(s)}
                                                onMouseLeave={() => setHoverRating(0)}
                                                className="p-1 transition-all active:scale-90 hover:scale-125 focus:outline-none"
                                            >
                                                <Star className={`w-10 h-10 ${s <= (hoverRating || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200 dark:text-slate-700'}`} />
                                            </button>
                                        ))}
                                    </div>
                                    {rating > 0 && rating <= 3 && (
                                        <div className="space-y-4 animate-in slide-in-from-top-4">
                                            <textarea
                                                value={feedbackText}
                                                onChange={e => setFeedbackText(e.target.value)}
                                                placeholder="What can we improve? (Optional)"
                                                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-white/5 text-sm font-medium outline-none focus:border-indigo-500 transition-all h-24"
                                            />
                                            <Button onClick={() => handleSubmitFeedback()} disabled={feedbackLoading} className="w-full h-14 rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900 font-bold">
                                                {feedbackLoading ? <Loader2 className="animate-spin" /> : "Submit Review"}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-4 animate-in zoom-in">
                                    <div className="text-6xl text-emerald-500">✨</div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">Feedback Received!</h3>
                                    <p className="text-sm font-medium text-slate-500">Your input helps us improve clinical efficiency.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Primary Actions */}
                    <div className="grid grid-cols-2 gap-4">
                        {!isDone && !isCancelled && (
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                disabled={actionLoading}
                                className="h-14 rounded-2xl border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
                            >
                                {actionLoading ? <Loader2 className="animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" /> Cancel</>}
                            </Button>
                        )}
                        <Button
                            onClick={handleShare}
                            className={`h-14 rounded-2xl font-bold transition-all shadow-xl ${isDone || isCancelled ? 'col-span-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-slate-900/10'}`}
                        >
                            <Share2 className="w-4 h-4 mr-2" /> Share Status
                        </Button>
                    </div>
                </div>

                {/* Footer Badges */}
                <div className="px-10 py-6 bg-slate-50 dark:bg-slate-950 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-2 text-slate-400 uppercase text-[9px] font-black tracking-widest">
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        HIPAA Compliant
                    </div>
                    <div className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase">Powered by QLink Engine</div>
                </div>
            </div>

            {/* Support Attribution */}
            <p className="mt-10 text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.5em]">2026 Enterprise Healthcare Solutions</p>
        </div>
    );
}
