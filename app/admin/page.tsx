"use client";

import { createBusiness, getAdminStats, toggleBusinessStatus, resetBusinessSession } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Loader2, Plus, ExternalLink, Activity, MessageSquare, Users, Power, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [phone, setPhone] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPassword, setAdminPassword] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchStats();
    }, []);

    async function fetchStats() {
        setLoading(true);
        const res = await getAdminStats();
        if (res.error) alert(res.error);
        else setStats(res);
        setLoading(false);
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading(true);
        const res = await createBusiness(name, slug, phone, adminEmail, adminPassword);
        setActionLoading(false);

        if (res.error) alert(res.error);
        else {
            setName("");
            setSlug("");
            setPhone("");
            setAdminEmail("");
            setAdminPassword("");
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

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COL: Add Clinic Form */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/10">
                                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <h2 className="font-bold text-lg text-white">Board a New Clinic</h2>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-5">
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 text-xs uppercase tracking-wider font-bold">Clinic Name</Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="E.g., Prime Care Clinic"
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
                                            placeholder="prime-care"
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
                                        <Label className="text-indigo-400 text-xs uppercase tracking-wider font-bold">Admin Credentials</Label>
                                        <span className="text-[10px] text-slate-500 bg-black/30 px-2 py-0.5 rounded">Auto-linked</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Input
                                            type="email"
                                            value={adminEmail}
                                            onChange={e => setAdminEmail(e.target.value)}
                                            placeholder="reception@clinic.com"
                                            required
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
                                            required
                                            className="bg-black/20 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-indigo-500"
                                        />
                                    </div>
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
                            <h2 className="font-bold text-xl text-white">Active Deployments ({stats.businesses?.length})</h2>
                        </div>

                        <div className="space-y-3">
                            {stats.businesses && stats.businesses.length === 0 && (
                                <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-700 text-slate-500">
                                    No infrastructure deployed yet.
                                </div>
                            )}

                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {stats.businesses?.map((b: any) => (
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
                                                Reception <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />
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
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
