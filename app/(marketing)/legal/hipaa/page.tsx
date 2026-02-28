/* eslint-disable react/no-unescaped-entities */
import { Shield, Lock, FileCheck } from "lucide-react";

export default function HipaaPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Shield className="w-6 h-6" /></div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">HIPAA Status</h1>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <div className="flex flex-col md:flex-row gap-8 items-center text-center md:text-left mb-12">
                        <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600"><FileCheck className="w-12 h-12" /></div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">HITECH Ready Infrastructure</h2>
                            <p className="text-slate-600 dark:text-slate-400 font-medium">QLink implements all administrative, physical, and technical safeguards required for HIPAA compliance.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                            <h4 className="font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-500" /> BAA Agreement</h4>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">We sign Business Associate Agreements (BAAs) with all Enterprise customers to ensure legal liability alignment.</p>
                        </div>
                        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                            <h4 className="font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> Audit Logs</h4>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Complete trail of PHI access, modifications, and exports for total clinical accountability.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
