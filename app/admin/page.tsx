"use client";

import { createBusiness, getAdminStats, toggleBusinessStatus, resetBusinessSession, deleteBusiness, getAnalytics, getClinicMetrics, updateBusinessSettings } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, ExternalLink, Activity, MessageSquare, Users, Power, RefreshCw, Trash2, BarChart2, Clock, Star, TrendingUp, Settings, ActivitySquare } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getClinicDate } from "@/lib/date";

export interface Business {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    created_at: string;
    contact_phone: string;
    daily_token_limit?: number;
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

    async function fetchAnalytics(preset: 'today' | '7days' | 'alltime') {
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
    }

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

    useEffect(() => {
        fetchStats();
        fetchAnalytics('today');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchStats() {
        setLoading(true);
        const res = await getAdminStats();
        if (res.error) alert(res.error);
        else setStats(res as unknown as AdminStats);
        setLoading(false);
    }

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

        if (res.error) alert(res.error);
        else {
            setName("");
            setSlug("");
            setPhone("");
            setAdminEmail("");
            setAdminPassword("");
            setExistingUserId("");
            fetchStats();
        }
    }

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    if (!stats) return <div className="p-8 text-center text-red-500">Access Denied</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 p-4 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">

                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-700/50">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-1">QLink Command Center</h1>
                        <p className="text-slate-400 font-medium">Manage tenants, monitor platform activity, and control deployments.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="px-4 py-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
                            <div className="p-2 bg-green-500/20 rounded-lg"><Activity className="w-5 h-5 text-green-400" /></div>
                            <div>
                                <div className="text-xl font-black text-white leading-none">{stats.activeSessions}</div>
                                <div className="text-xs text-slate-400 font-medium mt-1">Active Now</div>
                            </div>
                        </div>
                        <div className="px-4 py-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg"><Users className="w-5 h-5 text-blue-400" /></div>
                            <div>
                                <div className="text-xl font-black text-white leading-none">{stats.todayTokens}</div>
                                <div className="text-xs text-slate-400 font-medium mt-1">Tokens Today</div>
                            </div>
                        </div>
                        <div className="px-4 py-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg"><MessageSquare className="w-5 h-5 text-purple-400" /></div>
                            <div>
                                <div className="text-xl font-black text-white leading-none">{stats.totalMessages}</div>
                                <div className="text-xs text-slate-400 font-medium mt-1">Total Msgs</div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* ── ANALYTICS SECTION ── */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-blue-400" />
                            <h2 className="font-bold text-white text-lg">Platform Analytics</h2>
                        </div>
                        <div className="flex gap-2">
                            {(['today', '7days', 'alltime'] as const).map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => fetchAnalytics(preset)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${datePreset === preset
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
                                        }`}
                                >
                                    {preset === 'today' ? 'Today' : preset === '7days' ? 'Last 7 Days' : 'All Time'}
                                </button>
                            ))}
                            <button onClick={() => fetchAnalytics(datePreset)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition-colors">
                                <RefreshCw className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {analyticsLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-slate-400" /></div>
                    ) : analytics && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { label: 'Tokens Created', value: analytics.totalCreated, icon: <Users className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                                { label: 'Served', value: analytics.totalServed, icon: <Activity className="w-4 h-4" />, color: 'text-green-400', bg: 'bg-green-500/10' },
                                { label: 'Cancelled', value: analytics.totalCancelled, icon: <Power className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10' },
                                { label: 'Avg Rating', value: analytics.avgRating ? `${analytics.avgRating} ⭐` : '—', icon: <Star className="w-4 h-4" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                                { label: 'Avg Wait', value: analytics.avgWaitMins !== null ? `${analytics.avgWaitMins} min` : '—', icon: <Clock className="w-4 h-4" />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                                { label: 'Time Saved*', value: analytics.timeSavedLabel || '0m', icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                            ].map(({ label, value, icon, color, bg }) => (
                                <div key={label} className="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-2">
                                    <div className={`w-8 h-8 rounded-lg ${bg} ${color} flex items-center justify-center`}>{icon}</div>
                                    <div className={`text-2xl font-black ${color}`}>{value}</div>
                                    <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[10px] text-slate-600">* Time Saved = Tokens Served × 20 min (avg physical queue wait estimate)</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COL: Add Clinic Form */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/10">
                                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <h2 className="font-bold text-lg text-white">Register New Workspace</h2>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-5">
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 text-xs uppercase tracking-wider font-bold">Workspace Name</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="E.g., Customer Service Desk 1"
                                        required
                                        className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-xs uppercase tracking-wider font-bold">URL Slug</Label>
                                        <Input
                                            value={slug}
                                            onChange={e => setSlug(e.target.value)}
                                            placeholder="main-desk"
                                            required
                                            className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-300 text-xs uppercase tracking-wider font-bold">Phone</Label>
                                        <Input
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+91..."
                                            required
                                            className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 mt-2 border-t border-white/10 space-y-5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-indigo-400 text-xs uppercase tracking-wider font-bold">Staff Assignment</Label>
                                        <div className="flex bg-black/30 rounded-lg p-1 text-[10px] md:text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("new")}
                                                className={`px-3 py-1 rounded-md transition-colors ${linkMode === 'new' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                                            >New Staff</button>
                                            <button
                                                type="button"
                                                onClick={() => setLinkMode("existing")}
                                                className={`px-3 py-1 rounded-md transition-colors ${linkMode === 'existing' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                                            >Link UUID</button>
                                        </div>
                                    </div>

                                    {linkMode === "new" ? (
                                        <div className="space-y-4">
                                            <p className="text-[11px] text-indigo-300 leading-tight bg-indigo-500/10 p-2.5 rounded-lg border border-indigo-500/20 text-balance">
                                                We will <b>automatically</b> create a new login for this workspace. You do NOT need to go to your Supabase dashboard.
                                            </p>
                                            <div className="space-y-1.5">
                                                <Input
                                                    type="email"
                                                    value={adminEmail}
                                                    onChange={e => setAdminEmail(e.target.value)}
                                                    placeholder="admin@workspace.com"
                                                    required={linkMode === 'new'}
                                                    className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Input
                                                    type="password"
                                                    value={adminPassword}
                                                    onChange={e => setAdminPassword(e.target.value)}
                                                    placeholder="Set secure password"
                                                    minLength={6}
                                                    required={linkMode === 'new'}
                                                    className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <p className="text-[11px] text-slate-400 leading-tight bg-slate-500/10 p-2.5 rounded-lg border border-slate-500/20 text-balance">
                                                Already created a user manually in the Supabase Dashboard? Paste their <b>User UUID</b> here to grant them access.
                                            </p>
                                            <div className="space-y-1.5">
                                                <Input
                                                    type="text"
                                                    value={existingUserId}
                                                    onChange={e => setExistingUserId(e.target.value)}
                                                    placeholder="Paste Supabase Auth User UUID"
                                                    required={linkMode === 'existing'}
                                                    className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500 font-mono text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 rounded-xl mt-4 transition-all"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Deploy Environment"}
                                </Button>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT COL: Tenant List */}
                    <div className="lg:col-span-8 space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="font-bold text-xl text-white">Active Workspaces ({stats.businesses?.length})</h2>
                        </div>

                        <div className="space-y-3">
                            {stats.businesses && stats.businesses.length === 0 && (
                                <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-700 text-slate-500">
                                    No workspaces added yet.
                                </div>
                            )}

                            {stats.businesses && stats.businesses.map((b) => (
                                <div key={b.id} className="group relative overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 sm:p-5 hover:bg-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <div className={`w-2.5 h-2.5 rounded-full ${b.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
                                            <h3 className="font-bold text-lg text-white leading-none">{b.name}</h3>
                                            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-700">/{b.slug}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                                            <span className="font-mono bg-black/20 px-2 py-1 rounded">ID: {b.id.split('-')[0]}</span>
                                            <span>•</span>
                                            <span>Deployed {new Date(b.created_at).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span className="truncate max-w-[120px]">{b.contact_phone}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link href={`/${b.slug}/reception`} target="_blank">
                                            <Button variant="outline" size="sm" className="h-9 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
                                                Dashboard <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />
                                            </Button>
                                        </Link>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-9 px-3 ${b.is_active ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-green-400 hover:bg-green-500/10 hover:text-green-300'}`}
                                            onClick={async () => {
                                                if (confirm(`Are you sure you want to ${b.is_active ? 'suspend' : 'resume'} ${b.name}?`)) {
                                                    await toggleBusinessStatus(b.id, b.is_active);
                                                    fetchStats();
                                                }
                                            }}
                                        >
                                            <Power className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Force close active queue session"
                                            className="h-9 px-3 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                                            onClick={async () => {
                                                if (confirm(`Force reset today's session for ${b.name}?`)) {
                                                    await resetBusinessSession(b.id);
                                                    fetchStats();
                                                }
                                            }}
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="View Analytics"
                                            className="h-9 px-3 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                            onClick={() => loadClinicMetrics(b.id, b.name, b.daily_token_limit || (b.settings?.daily_token_limit as number) || 0)}
                                        >
                                            <ActivitySquare className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Settings"
                                            className="h-9 px-3 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                                            onClick={() => {
                                                setEditingClinic(b);
                                                setClinicSettings({ ...b.settings, daily_token_limit: b.daily_token_limit || b.settings?.daily_token_limit || 200 });
                                            }}
                                        >
                                            <Settings className="w-4 h-4" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Delete business"
                                            className="h-9 px-3 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                                            onClick={async () => {
                                                const confirmText = prompt(`Type "DELETE" to permanently delete ${b.name} and all its data.`);
                                                if (confirmText === 'DELETE') {
                                                    const res = await deleteBusiness(b.id);
                                                    if (res?.error) alert(res.error);
                                                    fetchStats();
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
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
                <DialogContent className="sm:max-w-[700px] bg-slate-900 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ActivitySquare className="w-5 h-5 text-emerald-400" />
                            {viewingClinicName} - Analytics
                        </DialogTitle>
                    </DialogHeader>

                    {clinicMetricsLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
                    ) : clinicMetrics ? (
                        <div className="space-y-6 py-4">
                            {/* Today's Snapshot & Lifetime Stats */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Live Today & Global</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-3xl font-black text-blue-400">{clinicMetrics.today.created} <span className="text-sm text-slate-500 font-medium max-w-[40px] truncate">/ {viewingClinicLimit || '∞'}</span></div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1">Created</div>
                                    </div>
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-3xl font-black text-green-400">{clinicMetrics.today.served}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1">Served</div>
                                    </div>
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-3xl font-black text-red-400">{clinicMetrics.today.skipped}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1">Skipped</div>
                                    </div>
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-3xl font-black text-orange-400">{clinicMetrics.today.emergency}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1">Priority Insertions</div>
                                    </div>

                                    {/* Global Aggregates */}
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-3xl font-black text-yellow-400">{clinicMetrics.avgRating ? `${clinicMetrics.avgRating}` : '—'}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1">Avg Rating ⭐</div>
                                    </div>
                                    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 flex flex-col items-center">
                                        <div className="text-2xl font-black text-emerald-400 flex items-center h-full">{clinicMetrics.timeSavedLabel || '0m'}</div>
                                        <div className="text-[10px] text-slate-500 uppercase font-black mt-1 text-center leading-tight">Est. Time Saved</div>
                                    </div>
                                </div>
                            </div>

                            {/* 30 Day Trend */}
                            <div className="pt-4 border-t border-slate-800">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Rolling 30 Days Trend</h3>
                                {clinicMetrics.trend && clinicMetrics.trend.length > 0 ? (
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {clinicMetrics.trend.map((day) => (
                                            <div key={day.date} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                                                <div className="font-mono text-sm text-slate-300">{day.date}</div>
                                                <div className="flex gap-6 text-sm">
                                                    <div className="text-blue-400 font-bold w-20 text-right">{day.total_tokens} Created</div>
                                                    <div className="text-purple-400 font-bold w-20 text-right">{day.avg_wait_time_minutes}m Wait</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-slate-500 text-sm">No historical data aggregated yet.</div>
                                )}
                            </div>

                        </div>
                    ) : (
                        <div className="text-red-400 text-center py-6">Failed to load analytics</div>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}
