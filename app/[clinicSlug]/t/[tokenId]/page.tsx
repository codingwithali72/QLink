"use client";

import { useClinicRealtime } from "@/hooks/useRealtime";
import { cancelToken } from "@/app/actions/queue";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, XCircle, Siren, Clock, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

// Format Helper
const formatToken = (num: number, isPriority: boolean) => isPriority ? `E-${num}` : `#${num}`;

export default function TicketPage({ params }: { params: { clinicSlug: string; tokenId: string } }) {
    const { session, tokens, loading, isConnected, isSynced } = useClinicRealtime(params.clinicSlug);
    const [actionLoading, setActionLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(false);

    const [showRealtimeError, setShowRealtimeError] = useState(false);
    useEffect(() => {
        // Only show error if we previously had connection
        if ((!isConnected || isOffline) && !loading && isSynced) {
            const timer = setTimeout(() => setShowRealtimeError(true), 5000);
            return () => clearTimeout(timer);
        } else {
            setShowRealtimeError(false);
        }
    }, [isConnected, isOffline, loading, isSynced]);

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

    // LOADING STATE: 
    const token = tokens.find(t => t.id === params.tokenId);
    const [showError, setShowError] = useState(false);
    const missingData = !token || !session;

    // Grace period for error
    useEffect(() => {
        if (!loading && isSynced && missingData) {
            const timer = setTimeout(() => setShowError(true), 2000);
            return () => clearTimeout(timer);
        } else if (!missingData) {
            setShowError(false);
        }
    }, [loading, isSynced, missingData]);

    if (loading || (missingData && (!isSynced || !showError))) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
                {!loading && missingData && <p className="absolute mt-16 text-xs text-slate-400">Verifying status...</p>}
            </div>
        );
    }

    if (missingData) {
        return <div className="p-8 text-center mt-10 text-slate-500">Ticket not found or session expired.</div>;
    }

    const handleCancel = async () => {
        if (!confirm("Are you sure you want to cancel your ticket?")) return;
        setActionLoading(true);
        const res = await cancelToken(params.clinicSlug, params.tokenId);
        if (res.error) alert("Error: " + res.error);
        setActionLoading(false);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `My Token ${formatToken(token.tokenNumber, token.isPriority)}`,
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
    const isServing = token.status === "SERVING";
    const isDone = token.status === "SERVED";
    const isCancelled = token.status === "CANCELLED";
    const isSkipped = token.status === "SKIPPED";
    const isEmergency = token.isPriority;

    // --- CURRENT SERVING LOGIC ---
    const servingToken = tokens.find(t => t.status === 'SERVING');
    const currentServingDisplay = servingToken ? formatToken(servingToken.tokenNumber, servingToken.isPriority) : "--";

    // --- WAITING CALCULATION ---
    let tokensAhead = 0;
    if (token.status === 'WAITING') {
        tokensAhead = tokens.filter(t => {
            if (t.status !== 'WAITING') return false;
            // Sorting logic matches Reception dashboard
            if (token.isPriority) return t.isPriority && t.tokenNumber < token.tokenNumber;
            return t.isPriority || t.tokenNumber < token.tokenNumber;
        }).length;
    }

    // --- ETA RANGE LOGIC (4-8 mins/person) ---
    const minMins = tokensAhead * 4;
    const maxMins = tokensAhead * 8;

    let etaText = "";
    if (tokensAhead === 0 && servingToken) etaText = "Next Up";
    else if (tokensAhead === 0 && !servingToken) etaText = "Ready Now";
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
    if (session.status === "PAUSED") { statusText = "QUEUE PAUSED"; statusBg = "bg-orange-500"; pulse = "animate-pulse"; }
    if (session.status === "CLOSED") { statusText = "CLOSED"; statusBg = "bg-slate-700"; pulse = ""; }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col relative">

            {showRealtimeError && (
                <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-center text-xs py-2 font-bold z-50 animate-in slide-in-from-top-full">
                    {isOffline ? "You are offline. Reconnecting..." : "Connecting to live updates..."}
                </div>
            )}

            <div className="flex-1 flex items-center justify-center p-4 relative">
                <div className={`w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all duration-1000 ease-in-out ${isApproaching ? `shadow-[0_0_60px_-5px_rgba(34,211,238,0.7)] ring-4 ring-cyan-400 ${breathe ? "scale-[1.04]" : "scale-[1.01]"} ` : "scale-100"}`}>

                    {/* HEADER */}
                    <div className={`p-6 pb-8 text-white ${statusBg} transition-colors duration-500 relative overflow-hidden`}>
                        {isEmergency && <Siren className="absolute -right-4 -top-4 w-32 h-32 text-white/10 rotate-12" />}

                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="opacity-80 text-xs font-semibold uppercase tracking-wider">Clinic</p>
                                <h2 className="font-bold text-lg leading-tight truncate max-w-[200px]">{params.clinicSlug}</h2>
                            </div>
                            {/* Sync Indicator */}
                            <div className="bg-black/20 backdrop-blur px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin duration-700" /> Synced
                            </div>
                        </div>

                        <div className="mt-6 text-center relative z-10">
                            <p className="opacity-80 text-sm uppercase tracking-widest font-medium">Your Token</p>
                            <h1 className="text-8xl font-black tracking-tighter my-2">{formatToken(token.tokenNumber, token.isPriority)}</h1>
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
                                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Tokens Left</p>
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
                                            Keep this page open. Check when tokens left ≤ 5.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Show if COMPLETED */}
                        {isDone && (
                            <div className="p-8 text-center space-y-4">
                                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                    <RefreshCw className="w-8 h-8 text-green-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900">All Done!</h3>
                                    <p className="text-slate-500">Thank you for visiting today.</p>
                                </div>
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
