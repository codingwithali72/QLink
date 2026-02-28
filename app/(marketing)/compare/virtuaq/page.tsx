/* eslint-disable react/no-unescaped-entities */
import { CheckCircle2, XCircle } from "lucide-react";

export default function CompareVirtuaqPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 text-center max-w-5xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-400 font-bold text-xs tracking-widest uppercase mb-8">
                    QLink vs. VirtuaQ
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    The End of <br />
                    <span className="text-indigo-600">Hardware Kiosks.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    VirtuaQ lives in the physical world of kiosks and printers. QLink lives in the digital pocket of every patient. Cut your TCO by 70% by moving to a pure-PWA architecture.
                </p>
            </section>

            {/* Comparison Highlights */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                <ComparisonCard
                    title="QLink"
                    isWinner
                    features={[
                        "Hardware Agnostic (Any Device)",
                        "Native WhatsApp Dispatch",
                        "Real-time Edge Propagation",
                        "Zero-Maintenance Cloud"
                    ]}
                />
                <ComparisonCard
                    title="VirtuaQ"
                    features={[
                        "Hardware Dependent",
                        "Legacy SMS / Local Server",
                        "Slow Sync Speeds",
                        "High Maintenance Overhead"
                    ]}
                />
            </section>
        </div>
    );
}

function ComparisonCard({ title, features, isWinner }: { title: string, features: string[], isWinner?: boolean }) {
    return (
        <div className={`p-10 rounded-[2.5rem] border ${isWinner ? 'bg-white dark:bg-slate-900 border-indigo-500 shadow-2xl skew-y-1' : 'bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 -skew-y-1'}`}>
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
