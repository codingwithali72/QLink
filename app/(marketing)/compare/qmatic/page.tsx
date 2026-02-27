import Link from "next/link";
import { CheckCircle2, XCircle, ArrowRight, ShieldCheck, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CompareQmaticPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-500/30">
            {/* Global Header */}


            {/* Hero Section */}
            <section className="pt-24 pb-16 px-6 text-center max-w-5xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold text-xs tracking-widest uppercase mb-8 shadow-sm">
                    The Modern Queue Alterative
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white leading-[1.05] mb-6">
                    Ditch the expensive kiosks.<br /> Move to cloud-native queuing.
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
                    Why spend $10,000+ on proprietary hardware that breaks, requires maintenance contracts, and takes 6 months to install? QLink runs perfectly on consumer Android tablets and standard Smart TVs.
                </p>
                <div className="flex justify-center gap-4">
                    <Button size="lg" className="h-14 px-8 text-lg font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20">
                        Try QLink Free for 14 Days
                    </Button>
                </div>
            </section>

            {/* The Direct Comparison Matrix */}
            <section className="py-24 px-6 max-w-5xl mx-auto">
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {/* Header Row */}
                    <div className="grid grid-cols-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                        <div className="p-8"><h3 className="text-xl font-bold text-slate-900 dark:text-white">Features</h3></div>
                        <div className="p-8 border-l border-r border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10">
                            <h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">QLink</h3>
                        </div>
                        <div className="p-8">
                            <h3 className="text-2xl font-bold text-slate-400 dark:text-slate-600">Legacy Systems</h3>
                        </div>
                    </div>

                    {/* Data Rows */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        <CompareRow
                            feature="Hardware Dependency"
                            qlink="Zero. Uses standard iPad/Android/Smart TV"
                            legacy="Requires proprietary branded kiosks ($3k-$10k+)"
                        />
                        <CompareRow
                            feature="Deployment Time"
                            qlink="Immediate (Same Day Setup via URL)"
                            legacy="2 to 6 months (Hardware Shipping & IT Install)"
                        />
                        <CompareRow
                            feature="Patient Check-in Method"
                            qlink="WhatsApp QR Scan (Zero Contact, No Apps)"
                            legacy="Physical touchscreens (Constant sanitization needed)"
                        />
                        <CompareRow
                            feature="Pricing Transparency"
                            qlink="Predictable Monthly SaaS (Unlimited WhatsApp)"
                            legacy="Opaque Enterprise Contracts + Maintenance Fees"
                        />
                        <CompareRow
                            feature="Updates & Maintenance"
                            qlink="Silent, Cloud-native updates via Edge API"
                            legacy="Manual USB updates or costly technician visits"
                        />
                    </div>
                </div>
            </section>

            {/* Friction Contrast */}
            <section className="py-24 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                    <div>
                        <Tv className="w-16 h-16 text-indigo-500 mb-6" />
                        <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">You already own all the hardware you need.</h2>
                        <ul className="space-y-4 text-lg font-medium text-slate-600 dark:text-slate-400">
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-green-500" /> Use a $150 Android tablet as the Reception Kiosk.</li>
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-green-500" /> Project the queue onto any standard $300 Smart TV.</li>
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-green-500" /> Manage the entire hospital flow from any laptop browser.</li>
                        </ul>
                    </div>
                    <div className="p-10 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-2xl">
                        <ShieldCheck className="w-16 h-16 text-slate-400 mx-auto mb-6" />
                        <h3 className="text-3xl font-black text-white mb-4">Enterprise Grade Security, Without Enterprise Bloat.</h3>
                        <p className="text-slate-400 text-lg">QLink features DPDP-compliant data retention, multi-tenant database isolation, and role-based access control, matching legacy security requirements at a fraction of the total cost of ownership (TCO).</p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-32 bg-white dark:bg-[#0B1120] text-center px-6">
                <h2 className="text-5xl font-black tracking-tighter text-slate-900 dark:text-white mb-6">Stop buying obsolete hardware.</h2>
                <p className="text-xl text-slate-500 dark:text-slate-400 mb-10 font-medium">Transform your hospital&apos;s patient experience today.</p>
                <Link href="/pricing">
                    <Button size="lg" className="h-16 px-10 rounded-full font-black text-lg shadow-xl shadow-indigo-600/20 bg-indigo-600 hover:bg-indigo-700 text-white">Compare QLink Plans <ArrowRight className="w-6 h-6 ml-2" /></Button>
                </Link>
            </section>
        </div>
    )
}

function CompareRow({ feature, qlink, legacy }: { feature: string, qlink: string, legacy: string }) {
    return (
        <div className="grid grid-cols-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="p-8 flex items-center"><span className="font-bold text-slate-700 dark:text-slate-300">{feature}</span></div>
            <div className="p-8 border-l border-r border-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-900/5 flex items-center">
                <CheckCircle2 className="w-5 h-5 text-indigo-500 mr-3 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white text-sm">{qlink}</span>
            </div>
            <div className="p-8 flex items-center">
                <XCircle className="w-5 h-5 text-slate-300 dark:text-slate-600 mr-3 shrink-0" />
                <span className="font-medium text-slate-500 dark:text-slate-500 text-sm">{legacy}</span>
            </div>
        </div>
    )
}
