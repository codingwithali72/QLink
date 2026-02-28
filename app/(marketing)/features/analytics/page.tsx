/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, Users, Clock } from "lucide-react";

export default function AnalyticsPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Predictive Clinical Insights
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Data-Driven <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-electric-cyan to-indigo-500">OPD Governance.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Move beyond snapshots. Understand your clinic&apos;s pulse with real-time heatmaps, provider performance audits, and patient satisfaction trends.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-[#0B1120] text-white font-black text-lg hover:bg-slate-800 shadow-2xl">
                            Explore BI Dashboard
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Metric Deep Dives */}
            <section className="py-24 bg-white dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                    <MetricSection
                        icon={<Users className="text-electric-cyan" />}
                        title="Patient Flow Heatmaps"
                        desc="Identify exact bottlenecks in your patient journey. See which days of the week and which hours of the day are causing the most friction."
                    />
                    <MetricSection
                        icon={<TrendingUp className="text-electric-cyan" />}
                        title="Provider Productivity"
                        desc="Audit doctor throughput without intruding on clinical workflows. Optimize staffing based on actual service time data."
                    />
                    <MetricSection
                        icon={<Clock className="text-electric-cyan" />}
                        title="Wait-Time Prediction"
                        desc="Our neural engine evaluates historical trends to deliver +/- 2 minute accuracy on wait time promises made to patients."
                    />
                    <MetricSection
                        icon={<BarChart3 className="text-electric-cyan" />}
                        title="WhatsApp Engagement"
                        desc="Track message open rates, conversion from notification to check-in, and post-consultation feedback response rates."
                    />
                </div>
            </section>
        </div>
    );
}

function MetricSection({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-6 items-start">
            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg">{icon}</div>
            <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{title}</h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}
