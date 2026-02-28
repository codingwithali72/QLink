/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart4, Tv, Building2 } from "lucide-react";

export default function MidSizeHospitalsPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Optimized for Poly-Clinics & Multi-Dept Centers
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Digitize Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-electric-cyan to-indigo-500">Patient Flow.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed font-medium">
                    Orchestrate multiple departments (OPD, Lab, Radiology) under one unified reception dashboard. Real-time dynamic routing and wait predictions.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="https://wa.me/919320201572?text=I%20want%20to%20book%20an%20architecture%20review%20for%20my%20hospital%20network." target="_blank">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Book Architecture Review
                        </Button>
                    </Link>
                    <Link href="https://wa.me/919320201572?text=I%20want%20to%20compare%20QLink%20Professional%20plans." target="_blank">
                        <Button variant="outline" size="lg" className="h-16 px-10 rounded-full border-2 font-bold text-lg">
                            Compare Professional Plan
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Feature Grid */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <FeatureCard
                    icon={<Building2 />}
                    title="Multi-Department Sync"
                    desc="Transition patients from Doctor consultation to Lab and back to Doctor without losing their place in line."
                />
                <FeatureCard
                    icon={<Tv />}
                    title="Smart TV Integration"
                    desc="Deploy high-resolution digital signage across waiting halls using existing Smart TVs. Audio announcements included."
                />
                <FeatureCard
                    icon={<BarChart4 />}
                    title="Operational BI"
                    desc="Identify peak hour footfall, average service times, and doctor utilization rates to optimize staffing."
                />
            </section>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="p-8 rounded-[2rem] bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xl shadow-indigo-500/5 hover:-translate-y-2 transition-transform duration-300">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">{icon}</div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4">{title}</h3>
            <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
        </div>
    );
}
