"use client";

import { cancelToken, getPublicTokenStatus, submitFeedback } from "@/app/actions/queue";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, XCircle, Siren, Clock, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

// ⭐ Replace this with your real Google Maps review link
const GOOGLE_REVIEW_URL = "https://g.page/r/CaBC123ExampleClinic/review";

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

    const fetchStatus = useCallback(async () => {
        if (isOffline) return;
        try {
            const res = await getPublicTokenStatus(params.tokenId);
            if (res.success && res.data) {
                setTokenData(res.data.token);
                setTokensAhead(res.data.tokens_ahead);
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

    // Setup Polling
    useEffect(() => {
        fetchStatus(); // initial fetch
        const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
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

    // Breathing Animation State
    const [breathe, setBreathe] = useState(false);
    useEffect(() => {
        const interval = setInterval(() => {
            setBreathe(prev => !prev);
        }, 800);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
            </div>
        );
    }

    if (syncError || !tokenData) {
        return <div className="p-8 text-center mt-10 text-slate-500">Ticket not found or session expired.</div>;
    }

    const handleSubmitFeedback = async () => {
        if (!rating) return;
        setFeedbackLoading(true);
        await submitFeedback(params.tokenId, rating, feedbackText);
        setFeedbackLoading(false);
        setFeedbackSubmitted(true);
        // 4 or 5 stars → redirect to Google review page
        if (rating >= 4) {
            setTimeout(() => window.open(GOOGLE_REVIEW_URL, "_blank"), 800);
        }
    };

    const handleCancel = async () => {
        if (!confirm("Are you sure you want to cancel your ticket?")) return;
        setActionLoading(true);
        const res = await cancelToken(params.clinicSlug, params.tokenId);
        if (res.error) alert("Error: " + res.error);
        else fetchStatus(); // Refresh instantly
        setActionLoading(false);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `My Token ${formatToken(tokenData.token_number, tokenData.is_priority)}`,
                    text: `Track my queue position for ${params.clinicSlug}`,
                    url: window.location.href,
                });
            } catch { console.error("Share failed"); }
        } else {
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert("Link copied to clipboard!");
            } catch { alert("Copy failed"); }
        }
    };

    // --- LOGIC ---
    const isServing = tokenData.status === "SERVING";
    const isDone = tokenData.status === "SERVED";
    const isCancelled = tokenData.status === "CANCELLED";
    const isSkipped = tokenData.status === "SKIPPED";
    const isEmergency = tokenData.is_priority;

    // --- ETA RANGE LOGIC (4-8 mins/ticket) ---
    const minMins = tokensAhead * 4;
    const maxMins = tokensAhead * 8;

    let etaText = "";
    if (tokensAhead === 0 && currentServingDisplay !== "--") etaText = "Next Up";
    else if (tokensAhead === 0 && currentServingDisplay === "--") etaText = "Ready Now";
    else if (minMins > 60) etaText = `> 1 hr`;
    else etaText = `${minMins}-${maxMins} mins`;

    const isApproaching = !isServing && !isDone && !isEmergency && !isCancelled && !isSkipped && minMins <= 10 && minMins > 0;

    // --- UI STATES ---
    let statusText = "WAITING";
    let statusBg = "bg-blue-600";
    let pulse = "";

    if (isApproaching) { statusText = "APPROACHING"; statusBg = "bg-blue-600"; pulse = "animate-pulse duration-700"; }
    if (isEmergency) { statusText = "EMERGENCY"; statusBg = "bg-red-600"; pulse = "animate-pulse"; }
    if (isServing) { statusText = "NOW SERVING"; statusBg = "bg-green-600"; pulse = "animate-bounce"; }
    if (isDone) { statusText = "COMPLETED"; statusBg = "bg-blue-600"; pulse = ""; }
    if (isCancelled) { statusText = "CANCELLED"; statusBg = "bg-slate-500"; pulse = ""; }
    if (isSkipped) { statusText = "SKIPPED"; statusBg = "bg-yellow-600"; pulse = ""; }
    if (tokenData.status === "PAUSED") { statusText = "QUEUE PAUSED"; statusBg = "bg-orange-500"; pulse = "animate-pulse"; }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col relative">

            {isOffline && (
                <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-center text-xs py-2 font-bold z-50 animate-in slide-in-from-top-full">
                    You are offline. Reconnecting...
                </div>
            )}

            <div className="flex-1 flex items-center justify-center p-4 relative">
                <div className={`w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all duration-1000 ease-in-out ${isApproaching ? `shadow-[0_0_60px_-5px_rgba(34,211,238,0.7)] ring-4 ring-cyan-400 ${breathe ? "scale-[1.04]" : "scale-[1.01]"} ` : "scale-100"}`}>

                    {/* HEADER */}
                    <div className={`p-6 pb-8 text-white ${statusBg} transition-colors duration-500 relative overflow-hidden`}>
                        {isEmergency && <Siren className="absolute -right-4 -top-4 w-32 h-32 text-white/10 rotate-12" />}

                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="opacity-80 text-xs font-semibold uppercase tracking-wider">Workspace</p>
                                <h2 className="font-bold text-lg leading-tight truncate max-w-[200px]">{params.clinicSlug}</h2>
                            </div>
                            {/* Sync Indicator */}
                            <div className="bg-black/20 backdrop-blur px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin duration-700" /> Synced
                            </div>
                        </div>

                        <div className="mt-6 text-center relative z-10">
                            <p className="opacity-80 text-sm uppercase tracking-widest font-medium">Your Token</p>
                            <h1 className="text-8xl font-black tracking-tighter my-2">{formatToken(tokenData.token_number, tokenData.is_priority)}</h1>
                            <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wide bg-white/20 backdrop-blur-sm ${pulse}`}>
                                {statusText}
                            </span>
                        </div>
                    </div>

                    <div className="relative h-6 bg-slate-50 flex items-center justify-between -mt-3 z-20 rounded-t-3xl">
                        {/* Decorative Curve Overlap */}
                    </div>

                    {/* INFO BODY */}
                    <div className="px-6 pb-8 bg-slate-50 space-y-6">

                        {/* ALERT: Emergency */}
                        {isEmergency && !isServing && !isDone && (
                            <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 animate-pulse">
                                <Siren className="w-6 h-6 text-red-600 shrink-0" />
                                <div>
                                    <h4 className="font-bold text-red-800 text-sm">Priority Status</h4>
                                    <p className="text-xs text-red-600 font-medium">You have been marked as urgent.</p>
                                </div>
                            </div>
                        )}

                        {!isDone && !isCancelled && !isSkipped && !isServing && (
                            <>
                                {/* GRID: Now Serving | Remaining */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white rounded-2xl text-center border border-slate-100 shadow-sm">
                                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Now Serving</p>
                                        <p className="text-3xl font-black text-slate-900 mt-1">{currentServingDisplay}</p>
                                    </div>
                                    <div className="p-4 bg-white rounded-2xl text-center border border-slate-100 shadow-sm">
                                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Tokens Ahead</p>
                                        <p className="text-3xl font-black text-slate-900 mt-1">{tokensAhead}</p>
                                    </div>
                                </div>

                                {/* ETA & NOTE */}
                                <div className="text-center space-y-2 py-2 mt-4">
                                    <div className="flex items-center justify-center gap-2 text-slate-600">
                                        <Clock className="w-5 h-5" />
                                        <span className="text-lg font-bold">ETA: <span className="text-slate-900">{etaText}</span></span>
                                    </div>
                                    <div className="mt-4">
                                        <p className="text-[13px] text-blue-900 font-bold bg-blue-100/80 inline-block px-4 py-2 rounded-xl">
                                            Keep this page open. Check when tokens ahead ≤ 5.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Show Room Allocation if SERVING */}
                        {isServing && tokenData.room_number && (
                            <div className="p-6 bg-green-50 rounded-2xl text-center border-2 border-green-200 shadow-sm animate-in zoom-in">
                                <p className="text-xs text-green-600 uppercase font-bold tracking-wider">Notice</p>
                                <p className="text-2xl font-black text-green-900 mt-1">Please proceed to</p>
                                <p className="text-5xl font-black text-green-700 mt-2">{tokenData.room_number}</p>
                            </div>
                        )}

                        {/* COMPLETED: Rating Section */}
                        {isDone && (
                            <div className="p-6 space-y-5">
                                {feedbackSubmitted ? (
                                    <div className="text-center py-6 space-y-3 animate-in zoom-in duration-300">
                                        <div className="text-4xl">🎉</div>
                                        <h3 className="font-bold text-xl text-slate-900">Thank you!</h3>
                                        <p className="text-slate-500 text-sm">Your feedback helps us improve.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-center space-y-1">
                                            <div className="bg-green-100 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <span className="text-2xl">✅</span>
                                            </div>
                                            <h3 className="font-bold text-xl text-slate-900">Visit Complete!</h3>
                                            <p className="text-slate-500 text-sm">How was your experience today?</p>
                                        </div>
                                        <div className="flex justify-center gap-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() => setRating(star)}
                                                    onMouseEnter={() => setHoverRating(star)}
                                                    onMouseLeave={() => setHoverRating(0)}
                                                    className="text-4xl transition-transform active:scale-90 hover:scale-110"
                                                >
                                                    {star <= (hoverRating || rating) ? "⭐" : "☆"}
                                                </button>
                                            ))}
                                        </div>
                                        {rating > 0 && rating <= 3 && (
                                            <textarea
                                                value={feedbackText}
                                                onChange={e => setFeedbackText(e.target.value)}
                                                placeholder="Tell us what we can improve..."
                                                className="w-full p-3 text-sm border border-slate-200 rounded-xl resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                        )}
                                        {rating > 0 && (
                                            <Button
                                                onClick={handleSubmitFeedback}
                                                disabled={feedbackLoading}
                                                className="w-full h-12 font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                                            >
                                                {feedbackLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Submit Feedback"}
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ACTIONS */}
                        <div className="pt-2 flex gap-3">
                            {!isCancelled && !isDone && !isServing && !isSkipped && (
                                <Button
                                    variant="destructive"
                                    disabled={actionLoading}
                                    className="flex-1 rounded-xl h-12 font-bold shadow-lg shadow-red-100 active:scale-95 transition-transform"
                                    onClick={handleCancel}
                                >
                                    {actionLoading ? <Loader2 className="animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" /> Cancel</>}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={handleShare}
                                className="flex-1 rounded-xl h-12 border-slate-200 font-bold bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-transform shadow-sm"
                            >
                                <Share2 className="w-4 h-4 mr-2" /> Share Link
                            </Button>
                        </div>
                    </div>

                    {/* FOOTER */}
                    <div className="bg-blue-600 p-3 text-center text-xs text-white/80 font-bold tracking-widest uppercase border-t border-blue-500">
                        Powered by QLink
                    </div>
                </div>
            </div>
        </div>
    );
}
