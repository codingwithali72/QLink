import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans">
            {/* Header/Hero for Pricing */}
            <section className="pt-24 pb-16 px-6 text-center max-w-4xl mx-auto">
                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white mb-6">
                    Transparent Pricing. <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-400">No Hidden SMS Fees.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium mb-4">
                    Other platforms charge you a base fee and then quietly tax you $150+ a month on SMS usage. QLink bundles unlimited WhatsApp alerts into a single, predictable monthly subscription.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4" /> 14-Day Free Trial. No Credit Card Required.
                </div>
            </section>

            {/* Pricing Tiers Grid */}
            <section className="max-w-7xl mx-auto px-6 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Starter Tier */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col hover:shadow-xl transition-shadow">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Starter</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 h-10">For single-doctor clinics moving off paper registers.</p>
                        <div className="my-6">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">₹1,999</span><span className="text-slate-500 font-bold">/mo</span>
                            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Per Location</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <FeatureItem included>Unlimited Walk-ins</FeatureItem>
                            <FeatureItem included>Basic Web Queue Display</FeatureItem>
                            <FeatureItem included>Up to 500 WhatsApp Alerts</FeatureItem>
                            <FeatureItem included>Daily Patient Log</FeatureItem>
                            <FeatureItem excluded>Multi-Doctor Routing</FeatureItem>
                            <FeatureItem excluded>Smart TV App</FeatureItem>
                        </ul>
                        <Button className="w-full h-12 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900">Start Free Trial</Button>
                    </div>

                    {/* Professional Tier (Popular) */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-indigo-500 relative flex flex-col shadow-2xl shadow-indigo-600/10 md:-mt-4 md:mb-4 z-10">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                            Most Popular
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Professional</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 h-10">The standard for polyclinics. Zero messaging anxiety.</p>
                        <div className="my-6">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">₹4,999</span><span className="text-slate-500 font-bold">/mo</span>
                            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Per Location</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1 border-t border-slate-100 dark:border-slate-800 pt-6">
                            <li className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2">Everything in Starter, plus:</li>
                            <FeatureItem included>Multi-Doctor/Dept Routing</FeatureItem>
                            <FeatureItem included>Smart TV Native Integration</FeatureItem>
                            <FeatureItem included>Unlimited WhatsApp Alerts*</FeatureItem>
                            <FeatureItem included>Automated Feedback Surveys</FeatureItem>
                            <FeatureItem included>Basic Analytics Reports</FeatureItem>
                        </ul>
                        <Button className="w-full h-12 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white">Start Free Trial</Button>
                        <p className="text-[10px] text-center text-slate-400 mt-3">*Subject to Fair Use Policy (5,000 msgs/mo)</p>
                    </div>

                    {/* Business Tier */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col hover:shadow-xl transition-shadow">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Business</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 h-10">For diagnostic centers needing deep operational data.</p>
                        <div className="my-6">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">₹8,999</span><span className="text-slate-500 font-bold">/mo</span>
                            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Per Location</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1 border-t border-slate-100 dark:border-slate-800 pt-6">
                            <li className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2">Everything in Pro, plus:</li>
                            <FeatureItem included>Service Intelligence Heatmaps</FeatureItem>
                            <FeatureItem included>Staff Utilization Analytics</FeatureItem>
                            <FeatureItem included>Multi-Location Dashboard</FeatureItem>
                            <FeatureItem included>API Access (Rate Limited)</FeatureItem>
                            <FeatureItem included>Priority Email Support</FeatureItem>
                        </ul>
                        <Button variant="outline" className="w-full h-12 rounded-xl border-2 font-bold">Contact Sales</Button>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="bg-slate-900 dark:bg-slate-950 p-8 rounded-3xl border border-slate-800 flex flex-col text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
                        <h3 className="text-2xl font-black mb-2">Enterprise</h3>
                        <p className="text-sm text-slate-400 h-10">API-first deployments for multi-branch hospital networks.</p>
                        <div className="my-6">
                            <span className="text-4xl font-black tracking-tighter">Custom</span>
                            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">Enterprise Agreements</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1 border-t border-slate-800 pt-6">
                            <FeatureItem included textClass="text-slate-300">HIS / EMR Direct Integrations</FeatureItem>
                            <FeatureItem included textClass="text-slate-300">Dedicated Account Manager</FeatureItem>
                            <FeatureItem included textClass="text-slate-300">Custom DPDP Compliance Audits</FeatureItem>
                            <FeatureItem included textClass="text-slate-300">Private Cloud Deployment Option</FeatureItem>
                            <FeatureItem included textClass="text-slate-300">99.99% Uptime SLA</FeatureItem>
                        </ul>
                        <Button className="w-full h-12 rounded-xl font-bold bg-white text-slate-900 hover:bg-slate-200">Book Architecture Review</Button>
                    </div>
                </div>
            </section>

            {/* Hidden Cost Arbitrage Section */}
            <section className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c131d] py-24">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-6">Stop paying the &quot;Hidden SMS Tax&quot;.</h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 mb-12">
                        Did you know that legacy queue systems advertise a low monthly fee, but force you to buy expensive SMS credit bundles that expire? With QLink, WhatsApp alerts are bundled directly into your subscription.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                        <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                            <div className="flex items-center gap-3 mb-4"><XCircle className="text-red-500 w-6 h-6" /><h4 className="text-xl font-black text-slate-900 dark:text-white">Legacy Platforms</h4></div>
                            <ul className="space-y-3 text-slate-600 dark:text-slate-400 font-medium">
                                <li>Base Price: ₹2,000/mo</li>
                                <li>+ SMS Delivery (5000 msgs): ₹1,500/mo</li>
                                <li>+ Delivery Failure Rates: 15%</li>
                                <li className="pt-4 border-t border-red-200 dark:border-red-800/50 font-black text-slate-900 dark:text-white">Effective Cost: ₹3,500+/mo (Unpredictable)</li>
                            </ul>
                        </div>
                        <div className="p-8 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                            <div className="flex items-center gap-3 mb-4"><CheckCircle2 className="text-emerald-500 w-6 h-6" /><h4 className="text-xl font-black text-slate-900 dark:text-white">QLink Professional</h4></div>
                            <ul className="space-y-3 text-slate-600 dark:text-slate-400 font-medium">
                                <li>Base Price: ₹4,999/mo</li>
                                <li>+ WhatsApp Delivery (Unlimited*): ₹0</li>
                                <li>+ Delivery Failure Rates: <span className="text-emerald-600 font-bold">&lt;1%</span></li>
                                <li className="pt-4 border-t border-emerald-200 dark:border-emerald-800/50 font-black text-slate-900 dark:text-white">Effective Cost: ₹4,999/mo (Guaranteed)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

function FeatureItem({ children, included, excluded, textClass }: { children: React.ReactNode, included?: boolean, excluded?: boolean, textClass?: string }) {
    const isIncluded = included || !excluded;
    return (
        <li className="flex items-start gap-3">
            {isIncluded ? (
                <CheckCircle2 className="w-5 h-5 text-indigo-500 grow-0 shrink-0" />
            ) : (
                <XCircle className="w-5 h-5 text-slate-300 dark:text-slate-700 grow-0 shrink-0" />
            )}
            <span className={`text-sm font-medium ${isIncluded ? (textClass || 'text-slate-700 dark:text-slate-300') : 'text-slate-400 dark:text-slate-600'}`}>
                {children}
            </span>
        </li>
    )
}
