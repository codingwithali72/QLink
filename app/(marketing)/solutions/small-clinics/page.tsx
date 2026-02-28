/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function SmallClinicsPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Built for Independent Practices
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    The Simple Way to <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-electric-cyan">Manage Your OPD.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Move your clinic off paper registers and local spreadsheets. Give your patients the convenience of joining your queue via WhatsApp.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <Link href="/login">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-600/20">
                            Start Free Trial
                        </Button>
                    </Link>
                    <Link href="/pricing">
                        <Button variant="outline" size="lg" className="h-16 px-10 rounded-full border-2 font-bold text-lg">
                            View Starter Plan
                        </Button>
                    </Link>
                </div>
            </section>

            {/* PAS Module: Problem & Solution */}
            <section className="py-24 bg-white dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
                    <div className="space-y-4">
                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-6"><XCircleIcon className="w-6 h-6" /></div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">Lobby Chaos</h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium">Crowded clinics lead to cross-infection and patient frustration. End the 2-hour wait on a plastic chair.</p>
                    </div>
                    <div className="space-y-4">
                        <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-6"><AlertCircleIcon className="w-6 h-6" /></div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">Staff Burnout</h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium">Receptionists spend all day answering "When is my turn?". Let our WhatsApp bot handle the inquiries.</p>
                    </div>
                    <div className="space-y-4">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-6"><CheckCircle2 className="w-6 h-6" /></div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">Digital Smile</h3>
                        <p className="text-slate-600 dark:text-slate-400 font-medium">Patients track their position from home or a nearby cafe. Walk in only when the doctor is ready.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}

function XCircleIcon({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
}

function AlertCircleIcon({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
}
