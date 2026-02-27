import Link from "next/link";
import { MessageSquare, QrCode, Smartphone, ArrowRight, ShieldCheck, Zap, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WhatsAppLandingPage() {
    return (
        <div className="min-h-screen bg-[#EFEAE2] dark:bg-[#0B141A] font-sans selection:bg-[#25D366]/30 relative overflow-hidden">
            {/* WhatsApp Doodle Background Pattern */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none" style={{ backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_icon.png')", backgroundSize: '120px' }}></div>

            {/* Navigation (Simplified for Landing Page) */}


            {/* Hero Section */}
            <section className="relative pt-16 pb-24 px-6 z-10">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="order-2 lg:order-1">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/10 text-[#008069] dark:text-[#25D366] font-bold text-xs tracking-widest uppercase mb-8 shadow-sm border border-[#25D366]/20">
                            <MessageSquare className="w-4 h-4" /> The Official WhatsApp Queue Engine
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white leading-[1.05] mb-6">
                            Run your entire waiting room on <span className="text-[#25D366]">WhatsApp.</span>
                        </h1>
                        <p className="text-xl text-slate-700 dark:text-slate-300 font-medium max-w-lg mb-10 leading-relaxed">
                            No proprietary apps to download. No expensive hardware kiosks to buy. Let patients join the queue, pick their doctor, and track their turn directly from the app they already use 100 times a day.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <Button size="lg" className="w-full sm:w-auto h-16 px-10 text-xl font-black rounded-full bg-[#128C7E] hover:bg-[#075E54] text-white shadow-2xl shadow-[#128C7E]/30 hover:-translate-y-1 transition-all">
                                Try the WhatsApp Demo
                            </Button>
                        </div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-6 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#25D366]" /> 100% DPDP Compliant & Secure
                        </p>
                    </div>

                    {/* Interactive WhatsApp Setup Visual */}
                    <div className="order-1 lg:order-2 relative flex justify-center">
                        <div className="w-full max-w-[340px] bg-[#EFEAE2] dark:bg-[#0B141A] rounded-[40px] shadow-2xl border-[10px] border-slate-800 dark:border-slate-950 flex flex-col h-[650px] relative z-20 overflow-hidden">
                            <div className="bg-[#008069] dark:bg-[#202C33] p-4 text-white flex items-center gap-3 pt-8 pb-4">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"><Activity className="w-5 h-5" /></div>
                                <div><p className="font-bold text-base leading-tight">QLink Hospital</p><p className="text-xs opacity-80">Official Business Account</p></div>
                            </div>
                            <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
                                <div className="w-full flex justify-center mb-2"><span className="bg-[#FFEECD] dark:bg-[#182229] text-slate-600 dark:text-slate-400 text-xs px-3 py-1 rounded-lg shadow-sm font-bold">Today</span></div>
                                <WhatsAppBubble from="user">Book an appointment</WhatsAppBubble>
                                <WhatsAppBubble from="bot">Welcome to QLink Hospital! 🏥<br /><br />Please select the department you wish to visit:</WhatsAppBubble>
                                <WhatsAppInteractiveList
                                    options={["Cardiology", "Pediatrics", "Ophthalmology", "General Medicine"]}
                                    selected="Cardiology"
                                />
                                <WhatsAppBubble from="user">Cardiology</WhatsAppBubble>
                                <WhatsAppBubble from="bot" highlight>
                                    ✅ <strong>Queue Joined Successfully!</strong><br /><br />
                                    <strong>Token Number:</strong> #A-42<br />
                                    <strong>Doctor:</strong> Dr. R. Sharma<br />
                                    <strong>Position:</strong> 3rd in line<br />
                                    <strong>Est. Wait:</strong> 45 mins<br /><br />
                                    <em>You can wait comfortably at the cafeteria. We will text you when it&apos;s your turn! ☕</em>
                                </WhatsAppBubble>
                            </div>
                            <div className="bg-[#F0F2F5] dark:bg-[#202C33] p-3 flex items-center gap-2">
                                <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-full h-10 px-4 flex items-center text-sm text-slate-400 font-medium shadow-sm">Type a message</div>
                                <div className="w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center text-white shadow-md"><ArrowRight className="w-5 h-5" /></div>
                            </div>
                        </div>

                        {/* QR Code Floating Element */}
                        <div className="absolute -bottom-8 -left-8 md:-left-12 bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 z-30 animate-in zoom-in duration-1000 delay-500 hover:scale-105 transition-transform">
                            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-xl mb-3">
                                <QrCode className="w-24 h-24 text-slate-900 dark:text-white" />
                            </div>
                            <p className="text-xs font-black text-center uppercase tracking-widest text-[#008069] dark:text-[#25D366]">Scan to Join</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Why WhatsApp Section (India Focus) */}
            <section className="bg-white dark:bg-[#111B21] py-24 border-y border-slate-200/50 dark:border-slate-800/50 relative z-10">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">India runs on WhatsApp. So should your clinic.</h2>
                        <p className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto">Don&apos;t force your patients to download a proprietary app they will use once a year. Meet them where they already are.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-[#0B141A] border border-slate-200 dark:border-slate-800">
                            <Smartphone className="w-10 h-10 text-[#25D366] mb-6" />
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Zero App Friction</h3>
                            <p className="text-slate-600 dark:text-slate-400 font-medium text-sm leading-relaxed">Elderly patients struggle with downloading new apps. With QLink, they simply scan a QR code at your reception and a WhatsApp chat opens automatically.</p>
                        </div>
                        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-[#0B141A] border border-slate-200 dark:border-slate-800">
                            <Zap className="w-10 h-10 text-[#25D366] mb-6" />
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Guaranteed Delivery</h3>
                            <p className="text-slate-600 dark:text-slate-400 font-medium text-sm leading-relaxed">Unlike standard SMS which gets blocked by DND registries or Carrier filtering, WhatsApp Business API messages have a 99% open rate, ensuring patients never miss their turn.</p>
                        </div>
                        <div className="p-8 rounded-3xl bg-slate-50 dark:bg-[#0B141A] border border-slate-200 dark:border-slate-800">
                            <MessageSquare className="w-10 h-10 text-[#25D366] mb-6" />
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">Interactive Lists</h3>
                            <p className="text-slate-600 dark:text-slate-400 font-medium text-sm leading-relaxed">QLink utilizes WhatsApp&apos;s native interactive menus. Patients can tap to select &quot;Cardiology&quot; or &quot;Dr. Sharma&quot; without needing to type anything out.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-24 bg-[#128C7E] text-white text-center px-6 relative z-10">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-6">Stop paying for SMS.</h2>
                    <p className="text-xl text-emerald-100 mb-10 font-medium">QLink Professional plans include unlimited WhatsApp queue alerts bundled directly into your monthly subscription.</p>
                    <Link href="/pricing">
                        <Button size="lg" className="h-16 px-10 rounded-full bg-white text-[#128C7E] hover:bg-slate-100 font-black text-lg shadow-2xl">View Transparent Pricing</Button>
                    </Link>
                </div>
            </section>

            {/* Footer Minimal */}

        </div>
    )
}

function WhatsAppBubble({ children, from, highlight }: { children: React.ReactNode, from: "user" | "bot", highlight?: boolean }) {
    return (
        <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${from === "user"
            ? "bg-[#D9FDD3] dark:bg-[#005C4B] self-end rounded-tr-sm text-slate-900 dark:text-[#E9EDEF]"
            : highlight
                ? "bg-white dark:bg-[#202C33] border border-[#25D366]/50 self-start rounded-tl-sm text-slate-800 dark:text-[#E9EDEF]"
                : "bg-white dark:bg-[#202C33] self-start rounded-tl-sm text-slate-800 dark:text-[#E9EDEF]"
            }`}>
            {children}
            <div className="text-[10px] text-right mt-1 opacity-60">10:42 AM</div>
        </div>
    )
}

function WhatsAppInteractiveList({ options, selected }: { options: string[], selected: string }) {
    return (
        <div className="bg-white dark:bg-[#202C33] rounded-2xl w-[85%] self-start shadow-sm border dark:border-slate-700 overflow-hidden text-sm">
            {options.map((opt, i) => (
                <div key={i} className={`p-3 border-b dark:border-slate-700 font-medium ${opt === selected ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-slate-900 dark:text-white' : 'text-blue-500 dark:text-blue-400'}`}>
                    {opt}
                </div>
            ))}
        </div>
    )
}
