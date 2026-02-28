"use client";

import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, ArrowRight, Lock, User } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError("");
        try {
            const res = await login(formData);
            if (res?.error) setError(res.error);
        } catch {
            setError("Authentication failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#F0EEE9] dark:bg-[#0B1120] flex items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Accents */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full"></div>
            </div>

            <div className="w-full max-w-[480px] z-10">
                {/* Logo Section */}
                <div className="flex flex-col items-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="h-20 w-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center font-black text-5xl text-white shadow-2xl shadow-indigo-600/20 border border-white/10 mb-6">
                        Q
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Command Center</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px] mt-2">Enterprise Access v2026</p>
                </div>

                {/* Login Card */}
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 shadow-2xl shadow-indigo-900/10 dark:shadow-black/50 border border-white/40 dark:border-white/5 backdrop-blur-3xl animate-in zoom-in-95 duration-700">
                    <form action={handleSubmit} className="space-y-8">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Work Identification</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                    <Input
                                        name="email"
                                        type="email"
                                        placeholder="clinical@qlink.com"
                                        required
                                        className="h-14 pl-12 rounded-2xl bg-[#F8F9FA] dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all font-medium"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Clearance Pin</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                    <Input
                                        name="password"
                                        type="password"
                                        placeholder="••••••••"
                                        required
                                        className="h-14 pl-12 rounded-2xl bg-[#F8F9FA] dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold animate-shake">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg tracking-tight shadow-xl shadow-indigo-600/20 active:scale-95 transition-all group"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <>Enter Console <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-1 transition-transform" /></>}
                        </Button>
                    </form>

                    <div className="mt-10 pt-8 border-t border-slate-100 dark:border-white/5 text-center">
                        <Link href="/pricing" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">
                            Upgrade to Enterprise Tier
                        </Link>
                    </div>
                </div>

                {/* Secure Footer */}
                <div className="mt-8 flex items-center justify-center gap-4 text-slate-400/50">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em]">AES-256 Cloud Infrastructure</span>
                </div>
            </div>
        </div>
    );
}
