"use client";

import { createBusiness, getAdminStats, toggleBusinessStatus, deleteBusiness, getAnalytics, getClinicMetrics, updateBusinessSettings, getDoctorProductivityBI, getHourlyFootfallBI, getWhatsAppAnalyticsBI } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, ExternalLink, Activity, MessageSquare, Users, Power, RefreshCw, Trash2, BarChart2, Clock, Star, TrendingUp, Settings, ActivitySquare, Search, XCircle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getClinicDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertOctagon } from "lucide-react";

import { getPlatformSystemHealth } from "@/app/actions/admin_extensions";

export interface Business {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    created_at: string;
    contact_phone: string;
    daily_token_limit?: number;
    tokens_today?: number;
    settings?: {
        whatsapp_enabled?: boolean;
        qr_intake_enabled?: boolean;
        dpdp_strict?: boolean;
        daily_token_limit?: number;
        daily_message_limit?: number;
        operation_mode?: 'OPD' | 'HOSPITAL';
        [key: string]: unknown;
    };
}

export interface AdminStats {
    activeSessions: number;
    todayTokens: number;
    totalMessages: number;
    messagesToday?: number;
    businesses: Business[];
    failedMessagesToday?: number;
    activeQueueTokens?: number;
    avgWaitMins?: number;
}

export default function AdminPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    // System Health State
    interface SystemHealth {
        webhooks: {
            total_sampled: number;
            failed: number;
            pending: number;
            processing: number;
            successRate: string;
        };
        db: {
            status: string;
        };
    }
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

    // Analytics State
    interface Analytics {
        totalCreated: number;
        totalServed: number;
        totalCancelled: number;
        avgRating: string | null;
        avgWaitMins: number | null;
        timeSavedLabel: string;
    }
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [datePreset, setDatePreset] = useState<'today' | '7days' | 'alltime'>('today');

    const today = getClinicDate();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const fetchAnalytics = useCallback(async (preset: 'today' | '7days' | 'alltime') => {
        setAnalyticsLoading(true);
        setDatePreset(preset);
        let from: string | undefined;
        let to: string | undefined = today;
        if (preset === 'today') { from = today; }
        else if (preset === '7days') { from = sevenDaysAgo; }
        else { from = undefined; to = undefined; }
        const res = await getAnalytics(from, to);
        if (!res.error) setAnalytics(res as unknown as Analytics);
        setAnalyticsLoading(false);
    }, [today, sevenDaysAgo]);

    // Clinic Specific Metrics State
    const [viewingClinicMetricsId, setViewingClinicMetricsId] = useState<string | null>(null);
    const [viewingClinicName, setViewingClinicName] = useState<string | null>(null);
    const [viewingClinicLimit, setViewingClinicLimit] = useState<number>(0);
    interface TrendDay {
        date: string;
        total_tokens: number;
        avg_wait_time_minutes: number;
        served_count?: number;
    }

    interface ClinicMetrics {
        today: { created: number; served: number; skipped: number; emergency: number; };
        trend: TrendDay[];
        avgRating: string | null;
        timeSavedLabel: string;
    }
    const [clinicMetrics, setClinicMetrics] = useState<ClinicMetrics | null>(null);
    const [clinicMetricsLoading, setClinicMetricsLoading] = useState(false);

    // Phase 4 BI State - typed interfaces to avoid any
    interface ProdBIRow { doctor_name: string; department_name: string; avg_consultation_mins: number; served_count: number; total_visits: number; }
    interface FootfallBIRow { avg_wait_mins: number; token_count: number; hour_of_day: number; }
    const [prodBI, setProdBI] = useState<ProdBIRow[]>([]);
    const [footfallBI, setFootfallBI] = useState<FootfallBIRow[]>([]);
    const [biLoading, setBILoading] = useState(false);

    async function loadClinicMetrics(businessId: string, name: string, limit: number) {
        setViewingClinicMetricsId(businessId);
        setViewingClinicName(name);
        setViewingClinicLimit(limit || 0);
        setClinicMetricsLoading(true);
        const res = await getClinicMetrics(businessId);
        if (!res.error) setClinicMetrics(res as unknown as ClinicMetrics);
        setClinicMetricsLoading(false);
    }

    // Form State
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [phone, setPhone] = useState("");
    const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPassword, setAdminPassword] = useState("");
    const [existingUserId, setExistingUserId] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    // Filter & Toast State
    const [adminSearchTerm, setAdminSearchTerm] = useState("");
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        description: string;
        action: () => Promise<void>;
        confirmText?: string;
        requireDeleteConfirm?: boolean;
    }>({ open: false, title: "", description: "", action: async () => { } });

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Settings Modal State
    const [editingClinic, setEditingClinic] = useState<Business | null>(null);
    interface ClinicSettings {
        whatsapp_enabled?: boolean;
        qr_intake_enabled?: boolean;
        dpdp_strict?: boolean;
        daily_token_limit?: number;
        daily_message_limit?: number;
        operation_mode?: 'OPD' | 'HOSPITAL';
        [key: string]: unknown;
    }
    const [clinicSettings, setClinicSettings] = useState<ClinicSettings>({});
    const [settingsSaving, setSettingsSaving] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const [res, healthRes] = await Promise.all([
                getAdminStats(),
                getPlatformSystemHealth()
            ]);

            if (res.error) showToast(res.error, 'error');
            else setStats(res as unknown as AdminStats);

            if (!healthRes.error) setSystemHealth(healthRes as unknown as SystemHealth);
        } catch (e: unknown) {
            console.error('[fetchStats] Error:', e);
            showToast('Service signal lost. Please refresh.', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchAnalytics('today');

        // Fetch Phase 4 BI Data
        const fetchBI = async () => {
            setBILoading(true);
            const [p, f, w] = await Promise.all([
                getDoctorProductivityBI(),
                getHourlyFootfallBI(),
                getWhatsAppAnalyticsBI()
            ]);
            if (!p.error) setProdBI(p.data || []);
            if (!f.error) setFootfallBI(f.data || []);
            void w; // WhatsApp BI fetched but not yet rendered
            setBILoading(false);
        };
        fetchBI();

        // Background polling for health
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, [fetchAnalytics, fetchStats]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading(true);
        const res = await createBusiness(
            name,
            slug,
            phone,
            linkMode === 'new' ? adminEmail : undefined,
            linkMode === 'new' ? adminPassword : undefined,
            linkMode === 'existing' ? existingUserId : undefined
        );
        setActionLoading(false);

        if (res.error) showToast(res.error, 'error');
        else {
            setName("");
            setSlug("");
            setPhone("");
            setAdminEmail("");
            setAdminPassword("");
            setExistingUserId("");
            showToast("Workspace created successfully!");
            fetchStats();
        }
    }

    const filteredBusinesses = stats?.businesses.filter(b =>
        b.name.toLowerCase().includes(adminSearchTerm.toLowerCase()) ||
        b.slug.toLowerCase().includes(adminSearchTerm.toLowerCase())
    ) || [];

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    if (!stats) return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;

    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] text-foreground p-4 sm:p-8 font-sans transition-colors duration-300 relative overflow-x-hidden">
            <div className="max-w-7xl mx-auto space-y-10 relative z-10">

                <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 lg:p-10 rounded-[3.5rem] mb-12 border border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/5">
                    <div className="flex items-center gap-6 lg:gap-8">
                        <div className="h-16 w-16 lg:h-20 lg:w-20 bg-indigo-600 rounded-[1.75rem] flex items-center justify-center text-white font-black text-3xl lg:text-4xl shadow-2xl shadow-indigo-500/40">Q</div>
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tighter">Strategic Command</h1>
                            <div className="flex items-center gap-4 text-[10px] lg:text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mt-2">
                                <span className="text-indigo-500 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Platform Active</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"></span>
                                <span className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors cursor-default"><Settings className="w-3.5 h-3.5" /> Orchestration v2026.4</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:flex items-center gap-4 lg:gap-6">
                        {[
                            { value: stats.activeSessions, label: 'Clinics Live', icon: <ActivitySquare className="w-5 h-5" />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { value: stats.activeQueueTokens || 0, label: 'Queue Active', icon: <Users className="w-5 h-5" />, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                            { value: stats.todayTokens, label: 'Total Intake', icon: <TrendingUp className="w-5 h-5" />, color: 'text-indigo-600', bg: 'bg-indigo-600/10' },
                            { value: stats.messagesToday ?? 0, label: 'Meta Traffic', icon: <MessageSquare className="w-5 h-5" />, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                        ].map((item, idx) => (
                            <div key={idx} className="bg-white/50 dark:bg-slate-800/20 p-5 rounded-[1.5rem] border border-white/20 dark:border-slate-700/30 flex items-center gap-4 shadow-sm hover:shadow-indigo-500/5 transition-all group">
                                <div className={cn("p-3 rounded-2xl group-hover:scale-110 transition-transform", item.bg, item.color)}>{item.icon}</div>
                                <div>
                                    <div className="text-2xl font-black leading-none tracking-tighter text-slate-900 dark:text-white">{item.value}</div>
                                    <div className="text-[8px] uppercase tracking-widest text-slate-400 font-black mt-1.5 opacity-60 leading-tight">{item.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </header>

                {/* ── ANALYTICS SECTION ── */}
                <Card className="border-2 border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/5 p-10 space-y-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />

                    <div className="flex items-center justify-between flex-wrap gap-6 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-sm"><BarChart2 className="w-6 h-6" /></div>
                            <div>
                                <h2 className="font-black text-2xl tracking-tighter text-slate-900 dark:text-white uppercase">Platform Performance</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Cross-Tenant Operational Velocity</p>
                            </div>
                        </div>
                        <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl items-center gap-1.5 border border-slate-200 dark:border-slate-700/30">
                            {(['today', '7days', 'alltime'] as const).map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => fetchAnalytics(preset)}
                                    className={cn(
                                        "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                        datePreset === preset
                                            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md scale-105"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {preset === 'today' ? 'Today' : preset === '7days' ? '7 Days' : 'All Time'}
                                </button>
                            ))}
                            <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-700 mx-1.5" />
                            <button onClick={() => fetchAnalytics(datePreset)} className="p-2 rounded-xl text-slate-400 hover:text-indigo-500 transition-colors">
                                <RefreshCw className={cn("w-4 h-4", analyticsLoading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {analyticsLoading ? (
                        <div className="flex justify-center py-20"><Loader2 className="animate-spin w-10 h-10 text-indigo-500/30" /></div>
                    ) : analytics && (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 relative z-10">
                            {[
                                { label: 'Intake Velocity', value: analytics.totalCreated, icon: <Users className="w-5 h-5" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10' },
                                { label: 'Service Output', value: analytics.totalServed, icon: <Activity className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
                                { label: 'Dropout Rate', value: analytics.totalCancelled, icon: <XCircle className="w-5 h-5" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
                                { label: 'Patient Sentiment', value: analytics.avgRating ? `${analytics.avgRating} ⭐` : '—', icon: <Star className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
                                { label: 'Median Dwell', value: analytics.avgWaitMins !== null ? `${analytics.avgWaitMins}m` : '—', icon: <Clock className="w-5 h-5" />, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
                                { label: 'Efficiency Gain', value: analytics.timeSavedLabel || '0m', icon: <TrendingUp className="w-5 h-5" />, color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-700/10' },
                            ].map(({ label, value, icon, color, bg }) => (
                                <div key={label} className="bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] p-6 border border-slate-100 dark:border-slate-800/40 flex flex-col gap-4 group/item hover:border-indigo-500/20 hover:bg-white dark:hover:bg-slate-900 transition-all duration-500">
                                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-item-hover:scale-110 shadow-sm", bg, color)}>{icon}</div>
                                    <div>
                                        <div className={cn("text-3xl font-black tracking-tighter leading-none", color)}>{value}</div>
                                        <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest mt-2 opacity-80 leading-tight">{label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-3 text-[9px] text-slate-400 font-extrabold bg-slate-100 dark:bg-slate-900/80 w-fit px-4 py-2 rounded-full border border-slate-200 dark:border-slate-800 shadow-inner">
                        <Activity className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="uppercase tracking-widest">Global Telemetry • Real-time Infrastructure Monitoring</span>
                    </div>
                </Card>

                {/* ── SYSTEM HEALTH SECTION ── */}
                {systemHealth && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Meta Pulse */}
                        <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-[2rem] border border-white/40 dark:border-slate-800/50 shadow-xl shadow-indigo-500/5 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-xl transition-colors relative", Number(systemHealth.webhooks.successRate) > 95 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500")}>
                                        <Activity className="w-4 h-4" />
                                        <div className={cn("absolute inset-0 rounded-xl animate-ping opacity-20", Number(systemHealth.webhooks.successRate) > 95 ? "bg-emerald-500" : "bg-amber-500")} />
                                    </div>
                                    <h3 className="font-black text-[10px] tracking-widest text-slate-400 uppercase">Meta API Pulse</h3>
                                </div>
                                <div className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border", Number(systemHealth.webhooks.successRate) > 95 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20")}>
                                    {systemHealth.webhooks.successRate}% OK
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                                    <div className="text-slate-400 mb-1 uppercase tracking-widest text-[8px] font-black">Dropped</div>
                                    <div className={cn("text-xl font-black", systemHealth.webhooks.failed > 0 ? "text-rose-500" : "text-slate-900 dark:text-white")}>{systemHealth.webhooks.failed}</div>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                                    <div className="text-slate-400 mb-1 uppercase tracking-widest text-[8px] font-black">Active</div>
                                    <div className="text-xl font-black text-slate-900 dark:text-white">{systemHealth.webhooks.processing + systemHealth.webhooks.pending}</div>
                                </div>
                            </div>
                        </Card>

                        {/* Outbound Metering */}
                        <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-[2rem] border border-white/40 dark:border-slate-800/50 shadow-xl shadow-indigo-500/5">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                                    <MessageSquare className="w-4 h-4" />
                                </div>
                                <h3 className="font-black text-[10px] tracking-widest text-slate-400 uppercase">Outbound Metering</h3>
                            </div>
                            <div className="flex items-baseline gap-3">
                                <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{stats.messagesToday || 0}</span>
                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Dispatches</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(((stats.messagesToday || 0) / 1000) * 100, 100)}%` }} />
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Base Tier Usage</span>
                                    <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">1k Daily Cap</span>
                                </div>
                            </div>
                        </Card>

                        {/* Network Latency (Strategic View) */}
                        <Card className="lg:col-span-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-[2rem] border-2 border-indigo-500/20 shadow-2xl shadow-indigo-500/10 group overflow-hidden relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none" />
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl animate-pulse">
                                        <RefreshCw className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-black text-[10px] tracking-widest text-slate-400 uppercase">Global Orchestration Latency</h3>
                                </div>
                                <div className="px-3 py-1 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-500 uppercase tracking-widest border border-emerald-500/20">
                                    Optimal Flow
                                </div>
                            </div>
                            <div className="flex gap-10 items-end relative z-10">
                                <div>
                                    <div className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter drop-shadow-sm">{stats.avgWaitMins || 0}<span className="text-xl text-slate-400 tracking-normal ml-2 lowercase font-bold">min median</span></div>
                                </div>
                                <div className="flex-1 space-y-3 mb-1">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                        <span>Node Health</span>
                                        <span>{stats.activeSessions} Active clusters</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex gap-0.5">
                                        <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: '70%' }} />
                                        <div className="h-full bg-amber-500" style={{ width: '20%' }} />
                                        <div className="h-full bg-rose-500 rounded-r-full" style={{ width: '10%' }} />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* ── PHASE 4 STRATEGIC BI SECTION ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 relative z-10">
                    {/* Physician Productivity Matrix */}
                    <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[3rem] border border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/5 flex flex-col gap-8 group">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">< Star className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Physician Productivity</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Cross-Consultant Efficiency Matrix</p>
                                </div>
                            </div>
                        </div>

                        {biLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-amber-500/20" /></div>
                        ) : prodBI.length > 0 ? (
                            <div className="space-y-6">
                                {prodBI.slice(0, 5).map((doc, idx) => (
                                    <div key={idx} className="space-y-3">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-900 dark:text-white">{doc.doctor_name} <span className="text-slate-400 opacity-60">({doc.department_name})</span></span>
                                            <span className="text-indigo-500">{Math.round(doc.avg_consultation_mins || 0)}m avg</span>
                                        </div>
                                        <div className="w-full h-3 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden flex">
                                            <div className="bg-indigo-500 h-full" style={{ width: `${Math.min(((doc.served_count || 0) / 50) * 100, 100)}%` }} />
                                        </div>
                                        <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                                            <span>{doc.served_count || 0} Served</span>
                                            <span>{doc.total_visits || 0} Total</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-10 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest opacity-40">No productivity data reported</div>
                        )}
                    </Card>

                    {/* Hourly Footfall Heatmap */}
                    <Card className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[3rem] border border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/5 flex flex-col gap-8 group">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl"><TrendingUp className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Wait-Time Heatmap</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Hourly Patient Footfall Trends</p>
                                </div>
                            </div>
                        </div>

                        {biLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-indigo-500/20" /></div>
                        ) : footfallBI.length > 0 ? (
                            <div className="flex items-end gap-2 h-48 pt-4">
                                {footfallBI.slice(-12).map((hour, idx) => (
                                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar">
                                        <div className="w-full bg-slate-100 dark:bg-slate-800/50 rounded-t-lg relative overflow-hidden flex flex-col justify-end" style={{ height: '100%' }}>
                                            <div
                                                className={cn("w-full transition-all duration-1000 group-hover/bar:brightness-125",
                                                    hour.avg_wait_mins > 30 ? "bg-rose-500" : hour.avg_wait_mins > 15 ? "bg-amber-500" : "bg-emerald-500"
                                                )}
                                                style={{ height: `${Math.min((hour.token_count / 15) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{hour.hour_of_day}:00</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-10 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest opacity-40">Awaiting footfall telemetry</div>
                        )}
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COL: Add Clinic Form */}
                    <div className="lg:col-span-4 space-y-8">
                        <Card className="border-2 border-white/40 dark:border-slate-800/50 shadow-2xl shadow-indigo-500/5 p-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[2.5rem] relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-sky-400 to-indigo-600 opacity-80" />
                            <div className="flex items-center gap-5 pb-8 mb-8 border-b border-slate-100 dark:border-slate-800/50">
                                <div className="p-4 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-2xl group-hover:rotate-[15deg] transition-all duration-500 shadow-sm">
                                    <Plus className="w-6 h-6 stroke-[3px]" />
                                </div>
                                <div>
                                    <h2 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Provision Tenant</h2>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Automated Orchestration</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-slate-400 text-[9px] uppercase tracking-[0.3em] font-black pl-1">Entity Name</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. Apollo Global Health"
                                        required
                                        className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-bold text-sm px-5"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-slate-400 text-[9px] uppercase tracking-[0.3em] font-black pl-1">Routing Slug</Label>
                                        <Input
                                            value={slug}
                                            onChange={e => setSlug(e.target.value.toLowerCase())}
                                            placeholder="apollo-hq"
                                            required
                                            className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-mono text-xs px-5"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-400 text-[9px] uppercase tracking-[0.3em] font-black pl-1">Support Line</Label>
                                        <Input
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+91..."
                                            required
                                            className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-bold text-sm px-5"
                                        />
                                    </div>
                                </div>

                                <div className="pt-8 mt-8 border-t border-slate-100 dark:border-slate-800/50 space-y-8">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-indigo-600 dark:text-indigo-400 text-[9px] uppercase tracking-[0.3em] font-black pl-1">Auth Configuration</Label>
                                        <div className="flex bg-slate-100 dark:bg-slate-800/50 rounded-xl p-1 text-[9px]">
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("new")}
                                                className={cn("px-4 py-2 rounded-lg transition-all font-black uppercase tracking-widest", linkMode === 'new' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600')}
                                            >AUTO</button>
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("existing")}
                                                className={cn("px-4 py-2 rounded-lg transition-all font-black uppercase tracking-widest", linkMode === 'existing' ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600')}
                                            >LINK</button>
                                        </div>
                                    </div>

                                    {linkMode === "new" ? (
                                        <div className="space-y-5 animate-in slide-in-from-left-4 duration-500">
                                            <div className="bg-indigo-500/5 p-5 rounded-[1.5rem] border border-indigo-500/10 space-y-2">
                                                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                                    <Settings className="w-3.5 h-3.5" />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Protocol Activation</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">System will provision exclusive Auth/DB nodes immediately upon deployment.</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Input
                                                    type="email"
                                                    value={adminEmail}
                                                    onChange={e => setAdminEmail(e.target.value)}
                                                    placeholder="owner@enterprise.com"
                                                    required={linkMode === 'new'}
                                                    className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-bold px-5"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Input
                                                    type="password"
                                                    value={adminPassword}
                                                    onChange={e => setAdminPassword(e.target.value)}
                                                    placeholder="Secure Administrative Key"
                                                    minLength={6}
                                                    required={linkMode === 'new'}
                                                    className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-bold px-5"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-5 animate-in slide-in-from-right-4 duration-500">
                                            <p className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800/50 font-bold">
                                                Map to existing Supabase Identity. Required for <b>Multi-Tenant Reconciliation</b>.
                                            </p>
                                            <div className="space-y-2">
                                                <Input
                                                    type="text"
                                                    value={existingUserId}
                                                    onChange={e => setExistingUserId(e.target.value)}
                                                    placeholder="Identity UUID (8-4-4-4-12)"
                                                    required={linkMode === 'existing'}
                                                    className="h-14 bg-slate-50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800/60 focus-visible:ring-indigo-500 rounded-2xl font-mono text-xs px-5"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black h-16 rounded-[1.5rem] mt-6 shadow-2xl shadow-indigo-600/30 transition-all hover:-translate-y-1 active:scale-95 text-xs uppercase tracking-[0.2em]"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Deploy Environment"}
                                </Button>
                            </form>
                        </Card>
                    </div>

                    {/* RIGHT COL: Tenant List */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-4">
                            <div>
                                <h2 className="font-black text-2xl text-slate-900 dark:text-white tracking-tighter uppercase">Active Environments</h2>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Deployments: {filteredBusinesses.length} Verified Segments</p>
                            </div>
                            <div className="relative w-full sm:w-96 group">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                <Input
                                    placeholder="Filter by name, slug or identifier..."
                                    value={adminSearchTerm}
                                    onChange={(e) => setAdminSearchTerm(e.target.value)}
                                    className="h-14 pl-14 bg-white/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800/60 text-slate-900 dark:text-white rounded-2xl focus-visible:ring-indigo-500 shadow-inner group-hover:border-indigo-500/20 transition-all font-bold placeholder:font-black placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest"
                                />
                            </div>
                        </div>

                        <div className="grid gap-6">
                            {filteredBusinesses.length === 0 && (
                                <Card className="p-20 text-center border-dashed border-[3px] bg-indigo-500/5 border-indigo-500/10 rounded-[3rem]">
                                    <div className="bg-white dark:bg-slate-900 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/5">
                                        <Search className="w-8 h-8 text-indigo-500/20" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Zero Matches</h3>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-2">Adjust Telemetry Filter Parameters</p>
                                </Card>
                            )}

                            {filteredBusinesses.map((b: Business) => (
                                <Card key={b.id} className="group relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-800/50 p-8 hover:bg-white dark:hover:bg-slate-900 transition-all duration-500 shadow-xl shadow-indigo-500/5 rounded-[2.5rem] border-l-[8px] border-l-indigo-600/10 hover:border-l-indigo-600">
                                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 relative z-10">
                                        <div className="flex-1 space-y-5">
                                            <div className="flex flex-wrap items-center gap-4">
                                                <h3 className="font-black text-2xl text-slate-900 dark:text-white tracking-tighter uppercase">{b.name}</h3>
                                                <Badge variant="secondary" className="px-3 py-1 rounded-xl text-[9px] font-black tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">/{b.slug}</Badge>
                                                <div className={cn("px-3 py-1 rounded-full text-[9px] font-black flex items-center gap-2 uppercase tracking-widest",
                                                    b.is_active ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                                )}>
                                                    <div className={cn("w-2 h-2 rounded-full", b.is_active ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
                                                    {b.is_active ? 'Production' : 'Suspended'}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-[10px] font-black uppercase tracking-widest">
                                                <div className="flex items-center gap-3 bg-indigo-500/5 px-4 py-2 rounded-xl border border-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                                    <Users className="w-4 h-4" />
                                                    <span>{b.tokens_today || 0} <span className="opacity-40 font-black">/ {b.daily_token_limit || b.settings?.daily_token_limit || '∞'}</span> <span className="text-[8px] opacity-60 ml-1">Tokens Today</span></span>
                                                </div>
                                                <div className="flex items-center gap-3 text-slate-400">
                                                    <Clock className="w-4 h-4 text-indigo-500/40" />
                                                    <span>Created {new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-slate-400 font-mono lower-case">
                                                    <Power className="w-3.5 h-3.5 text-indigo-500/40" />
                                                    <span>{b.contact_phone}</span>
                                                </div>
                                                <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/30">
                                                    <span className="opacity-40 text-[8px]">UUID</span>
                                                    <span className="font-mono text-[9px] text-slate-500">{b.id.split('-')[0]}..</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 flex-wrap">
                                            <Link href={`/clinic/${b.slug}/reception`} target="_blank">
                                                <Button variant="outline" size="sm" className="h-12 px-6 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 font-black border-slate-200 dark:border-slate-700 transition-all hover:-translate-y-1 active:scale-95 shadow-md flex items-center gap-3 uppercase tracking-widest text-[9px] text-indigo-600">
                                                    Terminal Access <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                                                </Button>
                                            </Link>

                                            <div className="w-[1px] h-8 bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block" />

                                            <div className="flex bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-2xl gap-1.5 border border-slate-100 dark:border-slate-700/30">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn("h-10 w-10 rounded-xl transition-all shadow-sm", b.is_active ? 'text-rose-500 hover:bg-rose-500/10' : 'text-emerald-500 hover:bg-emerald-500/10')}
                                                    onClick={() => setConfirmModal({
                                                        open: true,
                                                        title: b.is_active ? "Suspend Operation" : "Resume Operation",
                                                        description: `Modify operational status for ${b.name}. Public endpoints will be ${b.is_active ? 'deactivated' : 're-indexed'} immediately.`,
                                                        action: async () => {
                                                            const res = await toggleBusinessStatus(b.id, b.is_active);
                                                            if (res.error) showToast(res.error, 'error');
                                                            else {
                                                                showToast(`Operational status updated for ${b.name}`);
                                                                fetchStats();
                                                            }
                                                        }
                                                    })}
                                                >
                                                    <Power className="w-4 h-4 stroke-[3px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Network Intelligence"
                                                    className="h-10 w-10 rounded-xl text-indigo-500 hover:bg-indigo-500/10 shadow-sm"
                                                    onClick={() => loadClinicMetrics(b.id, b.name, b.daily_token_limit || (b.settings?.daily_token_limit as number) || 0)}
                                                >
                                                    <ActivitySquare className="w-4 h-4 stroke-[3px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Protocol Settings"
                                                    className="h-10 w-10 rounded-xl text-sky-500 hover:bg-sky-500/10 shadow-sm"
                                                    onClick={() => {
                                                        setEditingClinic(b);
                                                        setClinicSettings({ ...b.settings, daily_token_limit: b.daily_token_limit || b.settings?.daily_token_limit || 200 });
                                                    }}
                                                >
                                                    <Settings className="w-4 h-4 stroke-[3px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Terminate Segment"
                                                    className="h-10 w-10 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 shadow-sm"
                                                    onClick={() => setConfirmModal({
                                                        open: true,
                                                        title: "Critical Termination",
                                                        description: `Permanently expunge ${b.name} from the orchestration layer. This action is immutable. All metadata will be purged.`,
                                                        requireDeleteConfirm: true,
                                                        confirmText: "type TERMINATE to confirm",
                                                        action: async () => {
                                                            const res = await deleteBusiness(b.id);
                                                            if (res?.error) showToast(res.error, 'error');
                                                            else {
                                                                showToast(`Segment ${b.name} expunged`);
                                                                fetchStats();
                                                            }
                                                        }
                                                    })}
                                                >
                                                    <Trash2 className="w-4 h-4 stroke-[3px]" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
                                </Card>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* SETTINGS MODAL */}
            <Dialog open={!!editingClinic} onOpenChange={(open) => !open && setEditingClinic(null)}>
                <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5 text-indigo-400" />
                            Tenant Settings: {editingClinic?.name}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium text-slate-300">WhatsApp Messaging</Label>
                                <Switch
                                    checked={clinicSettings.whatsapp_enabled ?? true}
                                    onCheckedChange={(c) => setClinicSettings({ ...clinicSettings, whatsapp_enabled: c })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium text-slate-300">Public QR Intake</Label>
                                <Switch
                                    checked={clinicSettings.qr_intake_enabled ?? true}
                                    onCheckedChange={(c) => setClinicSettings({ ...clinicSettings, qr_intake_enabled: c })}
                                />
                            </div>

                            <div className="flex items-center justify-between bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                <div>
                                    <Label className="text-sm font-bold text-amber-500 flex items-center gap-1"><AlertOctagon className="w-3.5 h-3.5" /> DPDP Strict Logging</Label>
                                    <p className="text-[10px] text-amber-500/80 mt-1">Enforce mathematical consent tracking and audit logs.</p>
                                </div>
                                <Switch
                                    checked={clinicSettings.dpdp_strict ?? true}
                                    onCheckedChange={(c) => setClinicSettings({ ...clinicSettings, dpdp_strict: c })}
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <Label className="text-xs text-indigo-400 uppercase tracking-widest font-black flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> Operation Protocol</Label>
                                <div className="flex bg-black/20 rounded-xl p-1 gap-1">
                                    <button
                                        onClick={() => setClinicSettings({ ...clinicSettings, operation_mode: 'OPD' })}
                                        className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", (clinicSettings.operation_mode || 'OPD') === 'OPD' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300')}
                                    >Clinical OPD</button>
                                    <button
                                        onClick={() => setClinicSettings({ ...clinicSettings, operation_mode: 'HOSPITAL' })}
                                        className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", clinicSettings.operation_mode === 'HOSPITAL' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300')}
                                    >Hospital Suite</button>
                                </div>
                                <p className="text-[8px] text-slate-500 italic px-1">Switching to Hospital Suite enables multi-queue orchestration and triage automation.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-400 uppercase tracking-widest font-black">Daily Tokens (Max)</Label>
                                    <Input
                                        type="number"
                                        value={clinicSettings.daily_token_limit || 0}
                                        onChange={(e) => setClinicSettings({ ...clinicSettings, daily_token_limit: parseInt(e.target.value) })}
                                        className="bg-black/20 border-slate-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-indigo-400 uppercase tracking-widest font-black flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Msgs Limit</Label>
                                    <Input
                                        type="number"
                                        value={clinicSettings.daily_message_limit || 0}
                                        onChange={(e) => setClinicSettings({ ...clinicSettings, daily_message_limit: parseInt(e.target.value) })}
                                        className="bg-black/20 border-slate-700 font-mono text-indigo-400"
                                        title="Caps outbound Meta messages to control costs"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                            <Button variant="ghost" onClick={() => setEditingClinic(null)}>Cancel</Button>
                            <Button
                                className="bg-indigo-600 hover:bg-indigo-500"
                                disabled={settingsSaving}
                                onClick={async () => {
                                    if (!editingClinic) return;
                                    setSettingsSaving(true);
                                    await updateBusinessSettings(editingClinic.id, clinicSettings);
                                    setSettingsSaving(false);
                                    setEditingClinic(null);
                                    fetchStats();
                                }}
                            >
                                {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* CLINIC METRICS MODAL */}
            <Dialog open={!!viewingClinicMetricsId} onOpenChange={(open) => !open && setViewingClinicMetricsId(null)}>
                <DialogContent className="sm:max-w-4xl bg-card border-border shadow-2xl p-0 overflow-hidden rounded-3xl">
                    <div className="bg-primary/5 p-8 border-b border-border/60">
                        <DialogTitle className="flex items-center gap-4 text-2xl font-black tracking-tight">
                            <div className="p-2.5 bg-primary/10 text-primary rounded-2xl">
                                <ActivitySquare className="w-6 h-6 stroke-[2.5px]" />
                            </div>
                            <div>
                                <h2 className="text-foreground">{viewingClinicName}</h2>
                                <p className="text-xs text-muted-foreground font-medium mt-0.5 uppercase tracking-widest leading-none">Intelligence Snapshot</p>
                            </div>
                        </DialogTitle>
                    </div>

                    <div className="p-8">
                        {clinicMetricsLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary/40" /></div>
                        ) : clinicMetrics ? (
                            <div className="space-y-10">
                                {/* Today's Snapshot & Lifetime Stats */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Real-time Metrics</h3>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        {[
                                            { label: 'Today Created', value: clinicMetrics.today.created, sub: `/ ${viewingClinicLimit || '∞'}`, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
                                            { label: 'Today Served', value: clinicMetrics.today.served, sub: '', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
                                            { label: 'Today Skipped', value: clinicMetrics.today.skipped, sub: '', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
                                            { label: 'Priority Ins.', value: clinicMetrics.today.emergency, sub: '', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10' },
                                            { label: 'Avg Rating', value: clinicMetrics.avgRating ? `${clinicMetrics.avgRating} ⭐` : '—', sub: '', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
                                            { label: 'Est. Saved', value: clinicMetrics.timeSavedLabel || '0m', sub: '', color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
                                        ].map((stat, i) => (
                                            <div key={i} className="bg-secondary/30 rounded-2xl p-4 border border-border/40 flex flex-col items-center text-center group hover:bg-secondary/50 transition-colors">
                                                <div className={cn("text-2xl font-black mb-1", stat.color)}>
                                                    {stat.value}
                                                    {stat.sub && <span className="text-[10px] text-muted-foreground ml-1 opacity-60">{stat.sub}</span>}
                                                </div>
                                                <div className="text-[9px] text-muted-foreground uppercase font-black tracking-widest opacity-80 leading-tight">{stat.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 30 Day Trend */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] pl-1">Operational Trend (Last 30 Days)</h3>
                                    {clinicMetrics.trend && clinicMetrics.trend.length > 0 ? (
                                        <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {clinicMetrics.trend.map((day: TrendDay) => (
                                                <div key={day.date} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/40 hover:shadow-sm transition-all group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center font-mono text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                                                            {day.date.split('-').slice(1).join('/')}
                                                        </div>
                                                        <div className="font-bold text-sm text-foreground">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                                    </div>
                                                    <div className="flex items-center gap-8">
                                                        <div className="text-right">
                                                            <div className="text-xs font-black text-blue-600/80">{day.total_tokens}</div>
                                                            <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Created</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs font-black text-emerald-600/80">{day.served_count || 0}</div>
                                                            <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Served</div>
                                                        </div>
                                                        <div className="text-right min-w-[60px]">
                                                            <div className="text-xs font-black text-indigo-600/80">{day.avg_wait_time_minutes}m</div>
                                                            <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Wait</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
                                            <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                                            <div className="text-sm font-bold text-muted-foreground">Calibration Required</div>
                                            <p className="text-[11px] text-muted-foreground/60 mt-1">Collecting historical performance data...</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button onClick={() => setViewingClinicMetricsId(null)} variant="secondary" className="rounded-xl font-bold px-8">Close Analytics</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-rose-500 text-center py-12 font-bold">Telemetric Signal Lost</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* CONFIRMATION MODAL */}
            <Dialog open={confirmModal.open} onOpenChange={(o) => setConfirmModal(prev => ({ ...prev, open: o }))}>
                <DialogContent className="sm:max-w-[440px] bg-card border-border shadow-2xl p-0 overflow-hidden rounded-3xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-rose-500/5 p-8 border-b border-border/60">
                        <DialogTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-foreground">
                            <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-2xl">
                                <AlertOctagon className="w-6 h-6" />
                            </div>
                            {confirmModal.title}
                        </DialogTitle>
                    </div>

                    <div className="p-8 space-y-8">
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed bg-secondary/30 p-4 rounded-2xl border border-border/40">
                            {confirmModal.description}
                        </p>

                        {confirmModal.requireDeleteConfirm && (
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase tracking-[0.2em] font-black text-rose-500/60 pl-1">Safety Lock Required</Label>
                                <Input
                                    placeholder="Type DELETE to confirm"
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase();
                                        const btn = document.getElementById('final-confirm-btn') as HTMLButtonElement;
                                        if (btn) btn.disabled = val !== 'DELETE';
                                    }}
                                    className="h-12 bg-rose-500/5 border-rose-500/20 focus-visible:ring-rose-500 rounded-xl font-black tracking-widest text-center"
                                />
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t border-border/60">
                            <Button variant="ghost" className="flex-1 rounded-xl h-11 font-bold text-muted-foreground" onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))}>Abort</Button>
                            <Button
                                id="final-confirm-btn"
                                variant="destructive"
                                disabled={confirmModal.requireDeleteConfirm}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 font-extrabold h-11 rounded-xl shadow-lg shadow-rose-600/20"
                                onClick={async () => {
                                    await confirmModal.action();
                                    setConfirmModal(prev => ({ ...prev, open: false }));
                                }}
                            >
                                Execute Action
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* TOAST DISPLAY */}
            {toast && (
                <div className={cn(
                    "fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border backdrop-blur-xl animate-in slide-in-from-bottom-6 duration-500 flex items-center gap-4 min-w-[320px] justify-center",
                    toast.type === 'success'
                        ? "bg-emerald-500/90 dark:bg-emerald-600/90 border-emerald-400/30 text-white"
                        : "bg-rose-500/90 dark:bg-rose-600/90 border-rose-400/30 text-white"
                )}>
                    {toast.type === 'success' ? (
                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                            <Activity className="w-3 h-3 text-white" />
                        </div>
                    ) : (
                        <XCircle className="w-5 h-5 text-white" />
                    )}
                    <span className="font-extrabold text-sm tracking-tight">{toast.message}</span>
                </div>
            )}
        </div>
    );
}
