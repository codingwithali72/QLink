/* eslint-disable react/no-unescaped-entities */
import * as Icons from "lucide-react";

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-5xl mx-auto text-center">
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Reimagining the <br />
                    <span className="text-indigo-600">Patient Experience.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-3xl mx-auto mb-10 leading-relaxed">
                    QLink was founded with a simple mission: to eliminate the physical waiting room. We believe that healthcare should be frictionless, transparent, and respectful of a patient&apos;s time.
                </p>
            </section>

            {/* Values Grid */}
            <section className="py-24 bg-white dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <ValueCard icon={<Icons.Heart className="text-red-500" />} title="Patient First" desc="Every line of code we write is aimed at reducing patient anxiety and improving outcomes." />
                    <ValueCard icon={<Icons.Shield className="text-electric-cyan" />} title="Data Integrity" desc="We maintain the highest standards of clinical data security (SOC 2, HIPAA, DPDP)." />
                    <ValueCard icon={<Icons.Users className="text-indigo-500" />} title="Staff Empowerment" desc="We build tools that reduce burnout, allowing clinicians to focus on care, not queues." />
                    <ValueCard icon={<Icons.Zap className="text-amber-500" />} title="Instant Innovation" desc="Our edge-first architecture ensures that clinical flows are always-on and zero-latency." />
                </div>
            </section>
        </div>
    );
}

function ValueCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
            <div className="mb-6">{icon}</div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">{desc}</p>
        </div>
    );
}
