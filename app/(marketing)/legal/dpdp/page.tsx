/* eslint-disable react/no-unescaped-entities */
import { ShieldCheck, Database, Lock } from "lucide-react";

export default function DpdpPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white"><ShieldCheck className="w-6 h-6" /></div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">DPDP Compliance</h1>
                </div>
                <div className="space-y-10">
                    <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-emerald-500/5">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4">India&apos;s Data Protection Standard</h2>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed mb-6">QLink is built to comply with the Digital Personal Data Protection Act (DPDP) 2023. We ensure that patient data is processed only with explicit consent and for the purpose of clinical orchestration.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <ComplianceFeature icon={<Database />} title="Data Principal Rights" desc="Easy mechanisms for patients to request data deletion via WhatsApp." />
                            <ComplianceFeature icon={<Lock />} title="Data Fiduciary Duty" desc="Strict logging and auditing of all health data access within the platform." />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function ComplianceFeature({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-4">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl flex-shrink-0 flex items-center justify-center">{icon}</div>
            <div>
                <h4 className="font-black text-slate-900 dark:text-white mb-1">{title}</h4>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}
