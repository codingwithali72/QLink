"use client";

import { createBusiness, getAdminStats, toggleBusinessStatus, resetBusinessSession, deleteBusiness, getAnalytics, getClinicMetrics, updateBusinessSettings } from "@/app/actions/admin";
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
        daily_token_limit?: number;
        daily_message_limit?: number;
        [key: string]: unknown;
    };
}

export interface AdminStats {
    activeSessions: number;
    todayTokens: number;
    totalMessages: number;
    businesses: Business[];
    failedMessagesToday?: number;
    activeQueueTokens?: number;
}

export default function AdminPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);

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
        daily_token_limit?: number;
        daily_message_limit?: number;
        [key: string]: unknown;
    }
    const [clinicSettings, setClinicSettings] = useState<ClinicSettings>({});
    const [settingsSaving, setSettingsSaving] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        const res = await getAdminStats();
        if (res.error) showToast(res.error, 'error');
        else setStats(res as unknown as AdminStats);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStats();
        fetchAnalytics('today');
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
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 font-sans transition-colors duration-300">
            <div className="max-w-7xl mx-auto space-y-10">

                <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-8 border-b border-border/60">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-black shadow-lg shadow-primary/20">Q</div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Command Center</h1>
                        </div>
                        <p className="text-muted-foreground font-medium pl-1">Platform visibility, tenant management, and core analytics.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        {[
                            { value: stats.activeSessions, label: 'Active Now', icon: <Activity className="w-5 h-5" />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                            { value: stats.todayTokens, label: 'Tokens Today', icon: <Users className="w-5 h-5" />, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                            { value: stats.totalMessages, label: 'Total Messages', icon: <MessageSquare className="w-5 h-5" />, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                        ].map((item, idx) => (
                            <Card key={idx} className="px-5 py-3 border-border shadow-soft flex items-center gap-4 bg-card/50 backdrop-blur-sm">
                                <div className={cn("p-2 rounded-lg", item.bg, item.color)}>{item.icon}</div>
                                <div>
                                    <div className="text-2xl font-black leading-none">{item.value}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-1">{item.label}</div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </header>

                {/* ── ANALYTICS SECTION ── */}
                <Card className="border-border/60 shadow-medium p-8 space-y-8 bg-card/30 backdrop-blur-md overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                    <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary"><BarChart2 className="w-5 h-5" /></div>
                            <h2 className="font-extrabold text-xl tracking-tight">Platform Performance</h2>
                        </div>
                        <div className="flex bg-secondary/50 p-1 rounded-xl items-center gap-1">
                            {(['today', '7days', 'alltime'] as const).map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => fetchAnalytics(preset)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                                        datePreset === preset
                                            ? "bg-card text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                                    )}
                                >
                                    {preset === 'today' ? 'Today' : preset === '7days' ? 'Last 7 Days' : 'All Time'}
                                </button>
                            ))}
                            <div className="w-px h-4 bg-border/50 mx-1" />
                            <button onClick={() => fetchAnalytics(datePreset)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                                <RefreshCw className={cn("w-4 h-4", analyticsLoading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {analyticsLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-primary/40" /></div>
                    ) : analytics && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 relative z-10">
                            {[
                                { label: 'Created', value: analytics.totalCreated, icon: <Users className="w-4 h-4" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
                                { label: 'Served', value: analytics.totalServed, icon: <Activity className="w-4 h-4" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
                                { label: 'Cancelled', value: analytics.totalCancelled, icon: <XCircle className="w-4 h-4" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
                                { label: 'Rating', value: analytics.avgRating ? `${analytics.avgRating} ⭐` : '—', icon: <Star className="w-4 h-4" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
                                { label: 'Avg Wait', value: analytics.avgWaitMins !== null ? `${analytics.avgWaitMins} min` : '—', icon: <Clock className="w-4 h-4" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10' },
                                { label: 'Saved Est.*', value: analytics.timeSavedLabel || '0m', icon: <TrendingUp className="w-4 h-4" />, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
                            ].map(({ label, value, icon, color, bg }) => (
                                <div key={label} className="bg-card/50 rounded-2xl p-5 border border-border/40 flex flex-col gap-3 group hover:border-primary/20 transition-all duration-300">
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", bg, color)}>{icon}</div>
                                    <div>
                                        <div className={cn("text-3xl font-black tracking-tighter", color)}>{value}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1 opacity-80">{label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium bg-secondary/30 w-fit px-3 py-1 rounded-full border border-border/40">
                        <Activity className="w-3 h-3" />
                        * Time Saved = Tokens Served × 20 min (avg physical queue wait estimate)
                    </div>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COL: Add Clinic Form */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="border-border/60 shadow-medium p-8 bg-card/50 backdrop-blur-sm group overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-400 opacity-80" />
                            <div className="flex items-center gap-4 pb-6 mb-8 border-b border-border/60">
                                <div className="p-3 bg-primary/10 text-primary rounded-2xl group-hover:rotate-12 transition-transform duration-300 shadow-sm">
                                    <Plus className="w-6 h-6 stroke-[3px]" />
                                </div>
                                <div>
                                    <h2 className="font-extrabold text-xl text-foreground">Provision Tenant</h2>
                                    <p className="text-xs text-muted-foreground font-medium mt-0.5">Automated workspace deployment.</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-black pl-1">Display Name</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. Apollo Hospital"
                                        required
                                        className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl font-medium"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-black pl-1">Unique Slug</Label>
                                        <Input
                                            value={slug}
                                            onChange={e => setSlug(e.target.value.toLowerCase())}
                                            placeholder="apollo-main"
                                            required
                                            className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-black pl-1">Support Phone</Label>
                                        <Input
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+91..."
                                            required
                                            className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 mt-6 border-t border-border/60 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-primary text-[10px] uppercase tracking-[0.2em] font-black pl-1">Credentials</Label>
                                        <div className="flex bg-secondary/50 rounded-lg p-1 text-[10px]">
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("new")}
                                                className={cn("px-4 py-1.5 rounded-lg transition-all font-bold", linkMode === 'new' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                                            >AUTO-GEN</button>
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("existing")}
                                                className={cn("px-4 py-1.5 rounded-lg transition-all font-bold", linkMode === 'existing' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                                            >MANUAL UUID</button>
                                        </div>
                                    </div>

                                    {linkMode === "new" ? (
                                        <div className="space-y-4 animate-in slide-in-from-left-2 duration-300">
                                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 space-y-1">
                                                <div className="flex items-center gap-2 text-primary">
                                                    <Settings className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Automatic Setup</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">System will provision Auth & DB access immediately.</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Input
                                                    type="email"
                                                    value={adminEmail}
                                                    onChange={e => setAdminEmail(e.target.value)}
                                                    placeholder="owner@clinic.com"
                                                    required={linkMode === 'new'}
                                                    className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Input
                                                    type="password"
                                                    value={adminPassword}
                                                    onChange={e => setAdminPassword(e.target.value)}
                                                    placeholder="Store secure password"
                                                    minLength={6}
                                                    required={linkMode === 'new'}
                                                    className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
                                            <p className="text-[11px] text-muted-foreground leading-relaxed bg-secondary/40 p-4 rounded-2xl border border-border/40 font-medium">
                                                Linking an existing Supabase Auth user. Paste their <b>Auth UUID</b> to grant owner permissions.
                                            </p>
                                            <div className="space-y-2">
                                                <Input
                                                    type="text"
                                                    value={existingUserId}
                                                    onChange={e => setExistingUserId(e.target.value)}
                                                    placeholder="Auth UUID (e.g. 550e8400...)"
                                                    required={linkMode === 'existing'}
                                                    className="h-12 bg-secondary/30 border-border/80 focus-visible:ring-primary rounded-xl font-mono text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold h-14 rounded-2xl mt-4 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Deploy Workspace"}
                                </Button>
                            </form>
                        </Card>
                    </div>

                    {/* RIGHT COL: Tenant List */}
                    <div className="lg:col-span-8 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-2">
                            <div>
                                <h2 className="font-extrabold text-2xl text-foreground tracking-tight">Active Workspaces</h2>
                                <p className="text-xs text-muted-foreground font-medium mt-1">Found {filteredBusinesses.length} provisioned environments.</p>
                            </div>
                            <div className="relative w-full sm:w-80 group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Filter by name or slug..."
                                    value={adminSearchTerm}
                                    onChange={(e) => setAdminSearchTerm(e.target.value)}
                                    className="h-11 pl-11 bg-card/50 border-border/60 text-foreground rounded-2xl focus-visible:ring-primary shadow-soft"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {filteredBusinesses.length === 0 && (
                                <Card className="p-12 text-center border-dashed border-2 bg-transparent border-border/40">
                                    <div className="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="w-8 h-8 text-muted-foreground/40" />
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground">No matches found</h3>
                                    <p className="text-sm text-muted-foreground mt-1">Try adjusting your search criteria.</p>
                                </Card>
                            )}

                            {filteredBusinesses.map((b: Business) => (
                                <Card key={b.id} className="group relative overflow-hidden bg-card/40 backdrop-blur-sm border-border/60 p-6 hover:bg-card/60 transition-all duration-300 shadow-soft hover:shadow-medium border-l-[6px] border-l-primary/10 hover:border-l-primary/40">
                                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                                        <div className="flex-1 space-y-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="font-black text-xl text-foreground tracking-tight">{b.name}</h3>
                                                <Badge variant="secondary" className="px-2 py-0.5 rounded-lg text-[10px] font-mono tracking-tighter opacity-80 uppercase">/{b.slug}</Badge>
                                                <div className={cn("px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-2",
                                                    b.is_active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                                )}>
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", b.is_active ? "bg-emerald-500" : "bg-rose-500")} />
                                                    {b.is_active ? 'PRODUCTION' : 'SUSPENDED'}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-bold text-muted-foreground">
                                                <div className="flex items-center gap-2 bg-primary/5 px-2.5 py-1.5 rounded-xl border border-primary/10 text-primary">
                                                    <Users className="w-3.5 h-3.5" />
                                                    <span>{b.tokens_today || 0} <span className="opacity-50 font-medium">/ {b.daily_token_limit || b.settings?.daily_token_limit || '∞'}</span> TKN</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted-foreground/80">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>{new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted-foreground/80 font-mono">
                                                    <div className="w-1 h-1 rounded-full bg-border" />
                                                    <span>{b.contact_phone}</span>
                                                </div>
                                                <div className="flex items-center gap-2 bg-secondary/50 px-2 py-1 rounded-lg">
                                                    <span className="opacity-40 uppercase tracking-widest text-[8px]">UUID</span>
                                                    <span className="font-mono text-[9px]">{b.id.split('-')[0]}...</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link href={`/${b.slug}/reception`} target="_blank">
                                                <Button variant="outline" size="sm" className="h-10 rounded-xl bg-background hover:bg-secondary font-bold border-border/60 transition-all hover:scale-105 active:scale-95 shadow-soft">
                                                    View Dashboard <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
                                                </Button>
                                            </Link>

                                            <div className="w-px h-6 bg-border/60 mx-1 hidden sm:block" />

                                            <div className="flex bg-secondary/30 p-1 rounded-xl gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn("h-9 w-9 rounded-lg transition-all", b.is_active ? 'text-rose-500 hover:bg-rose-500/10' : 'text-emerald-500 hover:bg-emerald-500/10')}
                                                    onClick={() => setConfirmModal({
                                                        open: true,
                                                        title: b.is_active ? "Suspend Clinic" : "Activate Clinic",
                                                        description: `Confirm state change for ${b.name}. Public access will be ${b.is_active ? 'revoked' : 'granted'} immediately.`,
                                                        action: async () => {
                                                            const res = await toggleBusinessStatus(b.id, b.is_active);
                                                            if (res.error) showToast(res.error, 'error');
                                                            else {
                                                                showToast(`${b.name} state updated`);
                                                                fetchStats();
                                                            }
                                                        }
                                                    })}
                                                >
                                                    <Power className="w-4 h-4 stroke-[2.5px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Quick Analytics"
                                                    className="h-9 w-9 rounded-lg text-emerald-600 hover:bg-emerald-500/10"
                                                    onClick={() => loadClinicMetrics(b.id, b.name, b.daily_token_limit || (b.settings?.daily_token_limit as number) || 0)}
                                                >
                                                    <ActivitySquare className="w-4 h-4 stroke-[2.5px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Settings"
                                                    className="h-9 w-9 rounded-lg text-indigo-600 hover:bg-indigo-500/10"
                                                    onClick={() => {
                                                        setEditingClinic(b);
                                                        setClinicSettings({ ...b.settings, daily_token_limit: b.daily_token_limit || b.settings?.daily_token_limit || 200 });
                                                    }}
                                                >
                                                    <Settings className="w-4 h-4 stroke-[2.5px]" />
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Danger Zone"
                                                    className="h-9 w-9 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                                    onClick={() => setConfirmModal({
                                                        open: true,
                                                        title: "Irreversible Deletion",
                                                        description: `This will permanently erase all data for "${b.name}". History, staff, and tokens cannot be recovered.`,
                                                        requireDeleteConfirm: true,
                                                        confirmText: "type DELETE to confirm",
                                                        action: async () => {
                                                            const res = await deleteBusiness(b.id);
                                                            if (res?.error) showToast(res.error, 'error');
                                                            else {
                                                                showToast(`${b.name} deleted`);
                                                                fetchStats();
                                                            }
                                                        }
                                                    })}
                                                >
                                                    <Trash2 className="w-4 h-4 stroke-[2.5px]" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
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

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-400 uppercase">Max tokens/day</Label>
                                    <Input
                                        type="number"
                                        value={clinicSettings.daily_token_limit || 0}
                                        onChange={(e) => setClinicSettings({ ...clinicSettings, daily_token_limit: parseInt(e.target.value) })}
                                        className="bg-black/20 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-400 uppercase">Max msgs/day</Label>
                                    <Input
                                        type="number"
                                        value={clinicSettings.daily_message_limit || 0}
                                        onChange={(e) => setClinicSettings({ ...clinicSettings, daily_message_limit: parseInt(e.target.value) })}
                                        className="bg-black/20 border-slate-700"
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
