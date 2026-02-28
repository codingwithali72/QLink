/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CompareQlessPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 text-center max-w-5xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold text-xs tracking-widest uppercase mb-8">
                    QLink vs. Qless: The 2026 Reality
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Why Settle for <br />
                    <span className="text-indigo-600">Complex Legacy?</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Qless was built for a web-first world. QLink was built for a WhatsApp-first reality. No apps, no registration, just instant orchestration.
                </p>
                <div className="flex justify-center gap-4">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Book a Demo
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Comparison Grid */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                <ComparisonCard
                    title="QLink"
                    isWinner
                    features={[
                        "WhatsApp-Native (Zero App)",
                        "AI-Driven Wait Predictions",
                        "HL7/FHIR Compliant",
                        "One-Click Reception Dashboard"
                    ]}
                />
                <ComparisonCard
                    title="Qless"
                    features={[
                        "Web/SMS Based",
                        "Basic Queue Management",
                        "Legacy API Structure",
                        "Complex Configuration"
                    ]}
                />
            </section>
        </div>
    );
}

function ComparisonCard({ title, features, isWinner }: { title: string, features: string[], isWinner?: boolean }) {
    return (
        <div className={`p-10 rounded-[2.5rem] border ${isWinner ? 'bg-white dark:bg-slate-900 border-indigo-500 shadow-2xl scale-105' : 'bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800'}`}>
            <h3 className={`text-3xl font-black mb-8 ${isWinner ? 'text-indigo-600' : 'text-slate-400'}`}>{title}</h3>
            <ul className="space-y-4">
                {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-3">
                        {isWinner ? <CheckCircle2 className="w-6 h-6 text-electric-cyan" /> : <XCircle className="w-5 h-5 text-slate-300" />}
                        <span className={`font-bold ${isWinner ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{f}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
