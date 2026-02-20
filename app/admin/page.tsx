"use client";

import { createBusiness, getAdminStats, toggleBusinessStatus, resetBusinessSession } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ExternalLink, Activity, MessageSquare, Users, Power, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminPage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [phone, setPhone] = useState("");
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
        const res = await createBusiness(name, slug, phone);
        setActionLoading(false);

        if (res.error) alert(res.error);
        else {
            setName("");
            setSlug("");
            setPhone("");
            fetchStats();
        }
    }

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    if (!stats) return <div className="p-8 text-center text-red-500">Access Denied</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-5xl mx-auto space-y-8">

                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">QLink Super Admin</h1>
                        <p className="text-slate-500">Manage tenants and monitor activity</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:gap-4">
                        <Card className="px-4 py-2 flex items-center gap-2 bg-white shadow-sm">
                            <Activity className="w-4 h-4 text-green-500" />
                            <span className="font-bold">{stats.activeSessions}</span> <span className="text-sm text-slate-500">Active Sessions</span>
                        </Card>
                        <Card className="px-4 py-2 flex items-center gap-2 bg-white shadow-sm">
                            <Users className="w-4 h-4 text-blue-500" />
                            <span className="font-bold">{stats.todayTokens}</span> <span className="text-sm text-slate-500">Tokens Today</span>
                        </Card>
                        <Card className="px-4 py-2 flex items-center gap-2 bg-white shadow-sm">
                            <MessageSquare className="w-4 h-4 text-purple-500" />
                            <span className="font-bold">{stats.totalMessages}</span> <span className="text-sm text-slate-500">WhatsApp Msgs</span>
                        </Card>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* LEFT: Create Form */}
                    <div className="md:col-span-1">
                        <Card className="p-6 space-y-4 shadow-md">
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5" /> Add New Clinic
                            </h2>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Clinic Name</Label>
                                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Prime Care Clinic" required />
                                </div>
                                <div className="space-y-2">
                                    <Label>URL Slug (Unique)</Label>
                                    <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="prime-care" required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Contact Phone</Label>
                                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91..." required />
                                </div>
                                <Button type="submit" className="w-full bg-slate-900 text-white" disabled={actionLoading}>
                                    {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Create Business"}
                                </Button>
                            </form>
                        </Card>
                    </div>

                    {/* RIGHT: List */}
                    <div className="md:col-span-2 space-y-4">
                        <h2 className="font-bold text-xl text-slate-800">All Businesses ({stats.businesses?.length})</h2>
                        <div className="space-y-3">
                            {stats.businesses && stats.businesses.length === 0 && <p className="text-slate-400">No businesses found.</p>}

                            {stats.businesses?.map((b: any) => (
                                <Card key={b.id} className="p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                                    <div>
                                        <h3 className="font-bold text-base text-slate-900">{b.name}</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                            <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">/{b.slug}</span>
                                            <span>•</span>
                                            <span>Created: {new Date(b.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/${b.slug}/reception`} target="_blank">
                                            <Button variant="outline" size="sm" className="h-8 text-xs">
                                                Reception <ExternalLink className="w-3 h-3 ml-1" />
                                            </Button>
                                        </Link>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-8 text-xs ${b.is_active ? 'text-red-600 hover:text-red-700 hover:bg-red-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                                            onClick={async () => {
                                                if (confirm(`Are you sure you want to ${b.is_active ? 'disable' : 'enable'} ${b.name}?`)) {
                                                    await toggleBusinessStatus(b.id, b.is_active);
                                                    fetchStats();
                                                }
                                            }}
                                        >
                                            <Power className="w-3 h-3 mr-1" /> {b.is_active ? 'Disable' : 'Enable'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                            onClick={async () => {
                                                if (confirm(`Force reset today's session for ${b.name}?`)) {
                                                    await resetBusinessSession(b.id);
                                                    fetchStats();
                                                    alert('Session closed. They will start a new session upon next login.');
                                                }
                                            }}
                                        >
                                            <RefreshCw className="w-3 h-3 mr-1" /> Reset
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
