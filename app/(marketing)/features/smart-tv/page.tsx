/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tv, Monitor, Volume2, Shield } from "lucide-react";

export default function SmartTvPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Hardware Agnostic Signage
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    The Smartest <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-electric-cyan">Digital Signage PWA.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Turn any Android TV, FireStick, or PC into a professional hospital call system. Split-screen infotainment for a better patient experience.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Launch TV Dashboard
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Feature Highlights */}
            <section className="py-24 bg-white dark:bg-slate-900">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                    <FeatureItem icon={<Monitor />} title="4K Split Screen" desc="Live token list on the left, educational health content on the right." />
                    <FeatureItem icon={<Volume2 />} title="Audio Chimes" desc="English & Vernacular voice prompts for token announcements." />
                    <FeatureItem icon={<Tv />} title="Low Latency" desc="Updates reflect in <200ms when a doctor calls the next patient." />
                    <FeatureItem icon={<Shield />} title="Offline Resilient" desc="Queue keeps running even if the internet flickers." />
                </div>
            </section>
        </div>
    );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-600/20">{icon}</div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">{desc}</p>
        </div>
    );
}
