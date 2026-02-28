/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Zap, Globe, Cpu } from "lucide-react";

export default function EnterprisePage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Mission-Critical Infrastructure for Hospital Chains
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Global Patient <br />
                    <span className="text-indigo-600">Flow Governance.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-4xl mx-auto mb-10 leading-relaxed font-medium">
                    Centralized command center for multi-branch hospital networks. Compliance-first, API-first, and highly scalable. Build your own patient journey on our orchestration engine.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Request Enterprise Proposal
                        </Button>
                    </Link>
                    <Link href="/pricing">
                        <Button variant="outline" size="lg" className="h-16 px-10 rounded-full border-2 font-bold text-lg">
                            Architecture Whitepaper
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Enterprise Pillars */}
            <section className="py-24 bg-slate-900 text-white">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
                    <Pillar icon={<ShieldCheck className="text-electric-cyan" />} title="Security moats" desc="SOC 2 Type II, HIPAA, and DPDP ready. Full PII masking and data residency control." />
                    <Pillar icon={<Cpu className="text-electric-cyan" />} title="API First" desc="Seamless webhooks and REST endpoints to sync with your current HIS/EMR systems." />
                    <Pillar icon={<Globe className="text-electric-cyan" />} title="Multi-Region" desc="Manage hundreds of branches from a single global dashboard with localized routing." />
                    <Pillar icon={<Zap className="text-electric-cyan" />} title="High Availability" desc="99.99% Uptime SLA and dedicated enterprise support for zero mission-critical downtime." />
                </div>
            </section>
        </div>
    );
}

function Pillar({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="space-y-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">{icon}</div>
            <h3 className="text-xl font-black">{title}</h3>
            <p className="text-slate-400 font-medium text-sm leading-relaxed">{desc}</p>
        </div>
    );
}
