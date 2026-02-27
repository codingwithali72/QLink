import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen font-sans selection:bg-indigo-500/30 flex flex-col">
            {/* GLOBAL HEADER */}
            <nav className="sticky top-0 z-50 w-full backdrop-blur-xl bg-white/80 dark:bg-[#0B1120]/80 border-b border-slate-200/50 dark:border-slate-800/50 transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-600/30">Q</div>
                            <span className="font-extrabold text-2xl tracking-tighter text-slate-900 dark:text-white">QLink</span>
                        </Link>
                        {/* Intent-Driven Navigation */}
                        <div className="hidden lg:flex items-center gap-8 text-sm font-bold text-slate-600 dark:text-slate-300">
                            <div className="relative group cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <span className="flex items-center gap-1">Solutions <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100" /></span>
                                <div className="absolute top-full left-0 pt-4 hidden group-hover:block w-56">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-2 flex flex-col gap-1">
                                        <Link href="/solutions/small-clinics" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Small Clinics</Link>
                                        <Link href="/solutions/mid-size-hospitals" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Mid-Size Hospitals</Link>
                                        <Link href="/solutions/enterprise" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Enterprise Chains</Link>
                                    </div>
                                </div>
                            </div>
                            <div className="relative group cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <span className="flex items-center gap-1">Features <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100" /></span>
                                <div className="absolute top-full left-0 pt-4 hidden group-hover:block w-56">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-2 flex flex-col gap-1">
                                        <Link href="/whatsapp" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2">WhatsApp Queue</Link>
                                        <Link href="/features/smart-tv" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Smart TV Displays</Link>
                                        <Link href="/features/analytics" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Analytics Engine</Link>
                                        <Link href="/features/omnichannel" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">Omnichannel Routing</Link>
                                    </div>
                                </div>
                            </div>
                            <div className="relative group cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <span className="flex items-center gap-1">Compare <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100" /></span>
                                <div className="absolute top-full left-0 pt-4 hidden group-hover:block w-56">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-2 flex flex-col gap-1">
                                        <Link href="/compare/qmatic" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">vs Qmatic</Link>
                                        <Link href="/compare/qless" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">vs QLess</Link>
                                        <Link href="/compare/waitwhile" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">vs Waitwhile</Link>
                                        <Link href="/compare/virtuaq" className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">vs VirtuaQ</Link>
                                    </div>
                                </div>
                            </div>
                            <Link href="/pricing" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Pricing</Link>
                            <Link href="/roi-calculator" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-indigo-600 dark:text-indigo-400">ROI Calculator</Link>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4">
                        <ModeToggle />
                        <Link href="/login" className="hidden md:block">
                            <Button variant="ghost" className="font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600">
                                Login
                            </Button>
                        </Link>
                        <Link href="/login">
                            <Button className="font-bold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-full px-6 shadow-xl shadow-slate-900/10 dark:shadow-white/10 transition-all hover:scale-105">
                                Start Free Trial
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* PAGE CONTENT */}
            <main className="flex-1 bg-slate-50 dark:bg-[#0B1120]">
                {children}
            </main>

            {/* GLOBAL FOOTER */}
            <footer className="w-full bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
                    <div className="col-span-2">
                        <Link href="/" className="flex items-center gap-2 font-black text-white text-2xl tracking-tighter mb-4"><div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-sm">Q</div>QLink</Link>
                        <p className="text-sm font-medium pr-10 mb-6 font-sans">The cloud-native patient flow orchestration platform powered by WhatsApp. Ditch the kiosks, end the chaos.</p>
                        <div className="flex gap-4">
                            {/* Social Icons Placeholder */}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4">Product</h4>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/features/smart-tv" className="hover:text-white">Smart TV</Link></li>
                            <li><Link href="/whatsapp" className="hover:text-white">WhatsApp Integration</Link></li>
                            <li><Link href="/features/analytics" className="hover:text-white">Service Intelligence</Link></li>
                            <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4">Company</h4>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/about" className="hover:text-white">About Us</Link></li>
                            <li><Link href="/contact" className="hover:text-white">Contact Sales</Link></li>
                            <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                            <li><Link href="/resources/case-studies" className="hover:text-white">Case Studies</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4">Legal</h4>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/legal/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                            <li><Link href="/legal/terms-of-service" className="hover:text-white">Terms of Service</Link></li>
                            <li><Link href="/legal/dpdp" className="hover:text-white">DPDP Compliance</Link></li>
                            <li><Link href="/legal/hipaa" className="hover:text-white">HIPAA Status</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center text-xs">
                    <p>© 2026 QLink Healthcare SaaS. All rights reserved.</p>
                    <p className="mt-4 md:mt-0">Independent WhatsApp API Partner. Not affiliated with Meta Inc.</p>
                </div>
            </footer>
        </div>
    );
}
