/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, Globe, ShieldCheck, Zap } from "lucide-react";

export default function OmnichannelPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Unified Patient Journey
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    WhatsApp-Native <br />
                    <span className="text-indigo-600">Omnichannel Flow.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Bridge the gap between physical lobby signage, WhatsApp notifications, and web-based tracking. One source of truth for your entire clinical queue.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Book Architecture Demo
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Strategy Grid */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <JourneyCard
                    icon={<Globe className="text-indigo-500" />}
                    title="Seamless Web Integration"
                    desc="Patients can book from your website, track from their phone, and see their status on the clinic TV—all synced in real-time."
                />
                <JourneyCard
                    icon={<MessageSquare className="text-indigo-500" />}
                    title="WhatsApp-First Recall"
                    desc="Recalls aren't just one-way. Patients can confirm arrival, request a skip, or cancel their token directly via WhatsApp interaction."
                />
                <JourneyCard
                    icon={<ShieldCheck className="text-indigo-500" />}
                    title="Privacy by Design"
                    desc="Token-based identifiers ensure that patient PII is nunca displayed on public screens, maintaining full clinical confidentiality."
                />
                <JourneyCard
                    icon={<Zap className="text-indigo-500" />}
                    title="Instant Resilience"
                    desc="If one channel goes down, the journey persists. QLink handles failover between WhatsApp, SMS, and Web sockets automatically."
                />
            </section>
        </div>
    );
}

function JourneyCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="p-10 rounded-[2.5rem] bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-electric-cyan/50 transition-colors">
            <div className="mb-6">{icon}</div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 leading-tight">{title}</h3>
            <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
        </div>
    );
}
