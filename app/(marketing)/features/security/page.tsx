/* eslint-disable react/no-unescaped-entities */




import { ShieldCheck, Lock, Database, Key } from "lucide-react";

export default function SecurityPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white font-bold text-xs uppercase tracking-widest mb-8">
                    <ShieldCheck className="w-4 h-4 text-electric-cyan" /> Enterprise-Grade Security
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Clinical Data <br />
                    <span className="text-indigo-600">Locked Tight.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed font-medium">
                    QLink is built on a foundation of zero-trust architecture. We protect sensitive patient health information with multi-layer encryption and rigorous clinical compliance.
                </p>
            </section>

            {/* Compliance Grid */}
            <section className="py-24 bg-white dark:bg-slate-900 text-center border-y border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div className="p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">SOC 2</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Type II Certified</p>
                    </div>
                    <div className="p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">HIPAA</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">HITECH Ready</p>
                    </div>
                    <div className="p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">GDPR</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">EU Representative</p>
                    </div>
                    <div className="p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-shadow">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">DPDP</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">India Compliance</p>
                    </div>
                </div>
            </section>

            {/* Technical Moats */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
                <MoatCard icon={<Lock />} title="At-Rest Encryption" desc="All patient data is encrypted using AES-256 with rotation-enabled AWS KMS keys." />
                <MoatCard icon={<Database />} title="Isolated Persistence" desc="Each tenant operates on a logical row-level isolation, ensuring zero data-cross contagion." />
                <MoatCard icon={<Key />} title="Advanced RBAC" desc="Granular roles ensure that receptionists, doctors, and auditors only see what they need." />
            </section>
        </div>
    );
}

function MoatCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="space-y-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center mb-6">{icon}</div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
        </div>
    );
}
