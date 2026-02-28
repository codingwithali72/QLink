/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROICalculator } from "./_components/ROICalculator";

export default function Home() {
  return (
    <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
      {/* 2. HERO SECTION */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 inset-x-0 h-full w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-slate-50 dark:from-indigo-900/20 dark:via-[#0B1120] dark:to-[#0B1120] -z-10"></div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] tracking-widest uppercase mb-8 shadow-sm border border-indigo-100 dark:border-indigo-800/50">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
            Hospital-Grade Queue Orchestration
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-[6rem] font-black tracking-tighter text-slate-900 dark:text-white leading-[0.95] max-w-5xl mx-auto mb-8 drop-shadow-sm">
            From Waiting to Winning: <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-electric-cyan to-indigo-500 dark:from-indigo-400 dark:via-electric-cyan dark:to-indigo-300">
              Reclaim Your Service Flow.
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 font-medium max-w-3xl mx-auto mb-10 leading-tight">
            Is your lobby a "waiting room" or a "service hub"? <br />
            QLink combines <strong className="text-slate-900 dark:text-white">Service Intelligence</strong> with AI-driven virtual queuing to reduce physical wait times by 50%.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto h-16 px-10 text-xl font-black rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-600/30 hover:scale-105 transition-all duration-300">
                Start Free Trial
              </Button>
            </Link>
            <Link href="#roi">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-bold rounded-full border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 transition-all duration-300 group">
                <Icons.PlayCircle className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" /> Calculate ROI
              </Button>
            </Link>
          </div>

          {/* HERO VISUAL MOCKUP (3-Pane Strategy) */}
          <div className="mt-20 relative max-w-7xl mx-auto rounded-3xl border border-slate-200/50 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden p-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 h-min lg:h-[600px] rounded-2xl overflow-hidden bg-slate-100/50 dark:bg-[#020617]">
              {/* 1. TV Display Mockup */}
              <div className="p-6 md:p-10 flex flex-col h-full justify-between items-start border-r border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden group bg-[#020617] text-white">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>

                <div className="w-full flex justify-between items-start mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-2xl shadow-lg border border-white/10">Q</div>
                    <div>
                      <div className="font-black text-white text-xl tracking-tighter uppercase leading-none mb-1">DR. ALI CLINIC</div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-400 font-bold tracking-widest text-[9px] uppercase">Live Orchestration Dashboard</span>
                        <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Open
                  </div>
                </div>

                <div className="w-full text-center py-6">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] mb-4">Currently Serving</p>
                  <h2 className="text-[9rem] font-black text-white tracking-tighter leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500 tabular-nums">#42</h2>
                  <div className="mt-6 text-2xl font-black text-indigo-300 tracking-tight">Rahul K.</div>
                </div>

                <div className="w-full bg-white/5 dark:bg-black/40 rounded-[2rem] p-6 border border-white/5 mt-auto flex items-center justify-between">
                  <div className="flex flex-col text-left">
                    <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                      <Icons.Clock className="w-3 h-3" /> Queue Order
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 font-bold tabular-nums">43</span>
                      <p className="font-black text-white tracking-tight">Priya S.</p>
                    </div>
                  </div>
                  <Icons.Maximize className="w-6 h-6 text-slate-500 opacity-30" />
                </div>
              </div>

              {/* 2. Receptionist Command Center Mockup */}
              <div className="hidden lg:flex flex-col h-full bg-white dark:bg-slate-900 p-8 border-r border-slate-200/50 dark:border-slate-800/50 overflow-hidden relative group/reception">
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-indigo-500/5 to-transparent pointer-events-none"></div>

                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xl shadow-indigo-500/20">R</div>
                    <div>
                      <span className="block text-[11px] font-black uppercase tracking-widest text-slate-400">Reception</span>
                      <span className="block text-[9px] font-bold text-indigo-500 uppercase tracking-widest">Active Session</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50 animate-pulse"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                  </div>
                </div>

                <div className="space-y-6 text-left">
                  <div className="p-5 rounded-[2rem] bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Doctor Real-time Load</span>
                      <Icons.Activity className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 h-2 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)]"></div>
                      <div className="flex-1 h-2 bg-amber-500 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.5)]"></div>
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 flex justify-between items-center group/item hover:bg-indigo-500/10 transition-all cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-sm shadow-sm group-hover/item:scale-110 transition-transform">42</div>
                        <div>
                          <div className="text-xs font-black text-slate-900 dark:text-white uppercase leading-none mb-1">Rahul K.</div>
                          <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                            <Icons.Timer className="w-2 h-2" /> Serving 08:12
                          </div>
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded-md bg-indigo-600 text-[8px] font-black text-white uppercase tracking-widest">Active</div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex justify-between items-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-sm text-slate-400">43</div>
                        <div>
                          <div className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase leading-none mb-1">Priya S.</div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Waiting • 5m Ahead</div>
                        </div>
                      </div>
                      <Icons.ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-dashed border-slate-200 dark:border-slate-800">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Clinic Flow</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">High</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Est. Exit</p>
                        <p className="text-2xl font-black text-indigo-600 leading-none">11:05</p>
                      </div>
                    </div>

                    <button className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/50 active:scale-[0.98] transition-all group">
                      Next Patient
                      <Icons.ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. WhatsApp Mockup */}
              <div className="bg-[#EFEAE2] dark:bg-[#0c131d] p-4 relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.02]" style={{ backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_icon.png')", backgroundSize: '100px' }}></div>
                <div className="w-full max-w-[320px] bg-[#EFEAE2] dark:bg-[#0B141A] rounded-[48px] shadow-2xl border-[12px] border-slate-800 dark:border-slate-950 flex flex-col h-full max-h-[580px] relative z-10 overflow-hidden transform hover:rotate-1 hover:scale-[1.02] transition-transform duration-700">
                  {/* WhatsApp Header */}
                  <div className="bg-[#008069] dark:bg-[#202C33] p-5 text-white flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 relative">
                      <Icons.Building2 className="w-6 h-6" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#25D366] rounded-full border-2 border-[#008069] dark:border-[#202C33] flex items-center justify-center">
                        <Icons.Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                      </div>
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="font-bold text-sm leading-tight truncate">QLink Hospital</p>
                      <p className="text-[10px] opacity-80 leading-tight">Verified Business Account</p>
                    </div>
                  </div>

                  {/* Messages Context */}
                  <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto scrollbar-hide py-6 text-left">
                    <div className="text-center py-2">
                      <span className="bg-[#D1E4F5] dark:bg-[#182229] dark:text-[#8696a0] text-[#54656f] text-[9px] font-bold px-3 py-1 rounded-lg uppercase tracking-widest shadow-sm border border-black/5 dark:border-white/5">Today</span>
                    </div>

                    <MessageBubble from="user">Hi, I want to join the queue.</MessageBubble>
                    <MessageBubble from="bot">Welcome to QLink Hospital! 🏥 Which department would you like to visit today?</MessageBubble>
                    <MessageBubble from="user">Cardiology</MessageBubble>

                    <MessageBubble from="bot" highlight>
                      Welcome to QLink Hospital 🏥<br />
                      Your visit has been successfully added to the live queue.<br /><br />
                      🎟️ <strong>Token: A-15</strong><br />
                      ⏳ <strong>Wait: ~20 mins</strong><br />
                      🩺 <strong>Doctor: Dr. Ali</strong><br /><br />
                      Sit back — you're in the system.
                    </MessageBubble>

                    <MessageBubble from="bot">
                      <strong>Almost There — Confirm Arrival</strong><br /><br />
                      You’re now just 3 patients away. If you’ve reached the clinic, tap below so we can mark you present.<br /><br />
                      📍 <em>Arrival keeps the queue aligned.</em>
                    </MessageBubble>

                    <MessageBubble from="user">✅ I'm Here</MessageBubble>

                    <MessageBubble from="bot" highlight>
                      <strong>It's Your Turn! 🩺</strong><br /><br />
                      Dr. Ali is ready for you now in Cabin 4.<br /><br />
                      Please proceed to the consultation area.
                    </MessageBubble>

                    <MessageBubble from="bot">
                      Thank you for visiting QLink Hospital! 🏥<br /><br />
                      How was your experience today?<br />
                      ⭐ ⭐ ⭐ ⭐ ⭐
                    </MessageBubble>

                    <MessageBubble from="user">⭐ ⭐ ⭐ ⭐ ⭐</MessageBubble>
                  </div>

                  {/* Input Bar Placeholder */}
                  <div className="p-3 bg-slate-50 dark:bg-[#202C33] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <div className="flex-1 h-12 rounded-full bg-white dark:bg-[#2A3942] border border-slate-200 dark:border-slate-800 px-5 flex items-center text-slate-400 text-xs">Type a message...</div>
                    <div className="w-12 h-12 bg-[#00A884] rounded-full flex items-center justify-center text-white shadow-lg"><Icons.Mic className="w-6 h-6" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. TRUST BAND & SECURITY */}
      <section className="relative z-20 -mt-10 mb-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border border-white dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <TrustBadge icon={<Icons.ShieldCheck className="w-5 h-5" />} text="DPDP-Ready Governance" />
            <TrustBadge icon={<Icons.CheckCircle2 className="w-5 h-5 text-indigo-500" />} text="HIPAA-Aligned Security" />
            <TrustBadge icon={<Icons.Smartphone className="w-5 h-5" />} text="WhatsApp Business API" />
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block"></div>
            <div className="flex items-center gap-4 grayscale opacity-60">
              <span className="font-black text-slate-400 text-xs tracking-widest uppercase">Trusted By</span>
              <span className="font-bold text-slate-900 dark:text-white">MaxHealth</span>
              <span className="font-bold text-slate-900 dark:text-white">Apollo G.</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. THE PROBLEM SECTION */}
      <section className="py-32 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6 text-left">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.95]">
              Your Lobby is the <br />
              <span className="text-indigo-600">Heart of Your Brand.</span> <br />
              Stop letting it skip a beat.
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              A chaotic waiting room doesn't just frustrate visitors; it leads to <strong className="text-red-500">walked-out sales</strong>, negative Google reviews, and staff burnout. Every minute a customer stands in a physical line is a minute they spend thinking about your competitors.
            </p>
            <div className="flex gap-4 p-4 rounded-2xl bg-red-50 border border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
              <Icons.Zap className="w-6 h-6 text-red-600 shrink-0" />
              <p className="text-sm font-bold text-red-900 dark:text-red-400 italic">"The average patient decides to switch providers after just 20 minutes of unexplained waiting." — Healthcare Ops Report 2025</p>
            </div>
          </div>
          <div className="relative" id="roi">
            <ROICalculator />
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS */}
      <section className="py-32 bg-slate-900 text-white overflow-hidden relative" id="features">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-electric-cyan to-indigo-500"></div>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="mb-20">
            <span className="text-electric-cyan font-bold tracking-[0.3em] text-xs uppercase">The Orchestration Solution</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter mt-4 leading-[0.9]">Zero Friction. <br /><span className="text-slate-500">Total Autonomy.</span></h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <StepCard step="1" title="Scan & Join" desc="Patients scan a QR code at Reception. No App Downloads. WhatsApp opens instantly." icon={<Icons.ScanLine className="text-electric-cyan" />} />
            <StepCard step="2" title="Virtual Waiting" desc="Dynamic waitlist tracking from any smartphone. Give customers their time back." icon={<Icons.Smartphone className="text-electric-cyan" />} />
            <StepCard step="3" title="AI Predictions" desc="Neural wait-time engine manages expectations with +/- 2 minute accuracy." icon={<Icons.Zap className="text-electric-cyan" />} />
            <StepCard step="4" title="Smart Recall" desc="Automated WhatsApp alerts recall patients when their provider is 2 minutes away." icon={<Icons.MessageSquare className="text-electric-cyan" />} />
          </div>
        </div>
      </section>

      {/* 6. WHATSAPP & HARDWARE DOMINANCE */}
      <section className="py-32 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center text-left">
          <div>
            <div className="w-16 h-16 bg-[#25D366]/10 text-[#25D366] rounded-2xl flex items-center justify-center mb-6"><Icons.MessageSquare className="w-8 h-8" /></div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900 dark:text-white leading-tight mb-6">
              Built on WhatsApp. <br />Used by Everyone.
            </h2>
            <ul className="space-y-4 mb-8 text-lg font-medium text-slate-600 dark:text-slate-400">
              <FeatureListItem>No proprietary apps for elderly patients to learn.</FeatureListItem>
              <FeatureListItem>No expensive SMS fees. Unlimited WhatsApp alerts included.</FeatureListItem>
              <FeatureListItem>Interactive Department & Doctor Selection right in the chat.</FeatureListItem>
            </ul>
            <Link href="https://wa.me/919320201572?text=I%20want%20to%20have%20QLink%20software%20for%20my%20hospital." target="_blank">
              <Button className="bg-[#25D366] hover:bg-[#1DA851] text-white font-bold h-12 px-8 rounded-full shadow-lg shadow-[#25D366]/20 flex items-center gap-2">
                <Icons.MessageCircle className="w-5 h-5" /> Try the WhatsApp Demo
              </Button>
            </Link>
          </div>

          <div className="p-10 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6"><Icons.Tv className="w-8 h-8" /></div>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white leading-tight mb-6">
              100% Hardware Agnostic
            </h2>
            <p className="text-slate-600 dark:text-slate-400 font-medium mb-8">
              Competitors force you to buy $10k proprietary kiosks and ticket printers. QLink runs purely in the browser.
            </p>
            <ul className="space-y-4 text-slate-700 dark:text-slate-300 font-bold text-sm mb-8">
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use existing Smart TVs</span> <Icons.CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use consumer Android Tablets</span> <Icons.CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use current Reception Laptops</span> <Icons.CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
            </ul>
            <Link href="/tv/demo">
              <Button variant="outline" className="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 group">
                <Icons.Monitor className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                Launch TV Dashboard Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. ANALYTICS / SERVICE INTELLIGENCE */}
      <section className="py-32 bg-[#0B1120] text-white border-y border-slate-800 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-900/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-electric-cyan/5 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center text-left">
          <div>
            <Icons.BarChart4 className="w-12 h-12 text-electric-cyan mb-8" />
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-[0.95] mb-8">
              Turn Wait Times <br />
              Into <span className="text-electric-cyan text-glow">Intelligence.</span>
            </h2>
            <p className="text-xl text-slate-400 font-medium mb-10 leading-relaxed">
              Don't just manage lines—master them. Our <strong className="text-white">Service Intelligence</strong> dashboard gives you real-time visibility into peak hours, staff performance, and customer flow trends.
            </p>
            <div className="space-y-4">
              <BenefitLine text="Predictive staffing based on historical footfall." />
              <BenefitLine text="Real-time provider productivity heatmaps." />
              <BenefitLine text="Automated bottleneck detection & alerts." />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <AnalyticsCard title="Average Service Time" value="12m 45s" trend="Optimized" color="text-electric-cyan" />
            <div className="grid grid-cols-2 gap-4">
              <AnalyticsCard title="Patient Satisfaction" value="4.9/5" trend="+15% YoY" color="text-green-400" />
              <AnalyticsCard title="Revenue Leakage" value="0.4%" trend="-92% ROI" color="text-green-400" />
            </div>
          </div>
        </div>
      </section>

      {/* 9. FAQ SECTION */}
      <section className="py-32 max-w-4xl mx-auto px-6 text-center">
        <div className="mb-16">
          <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Common Questions</h2>
          <p className="text-slate-500 font-medium mt-2">Answers for humans and AI agents alike.</p>
        </div>
        <div className="space-y-6 text-left">
          <FAQItem
            question="How does a virtual queue work in a hospital?"
            answer="Patients join the waitlist via WhatsApp or a QR scan. Our AI engine predicts their wait time based on real-time doctor throughput. Patients receive automated status updates and are recalled only when their provider is ready, eliminating waiting room congestion."
          />
          <FAQItem
            question="Is QLink HIPAA and DPDP compliant?"
            answer="QLink implements HIPAA-aligned security architecture, including AES-256 encryption at rest and TLS for all data in transit. While the WhatsApp platform itself has unique BAA limitations, our internal data processing follows strict DPDP-ready lifecycle governance, ensuring minimal PII exposure and jurisdictional data residency."
          />
          <FAQItem
            question="Does it integrate with existing HIS/EMR systems?"
            answer="QLink is an API-first platform. We offer HL7/FHIR compatible webhooks and REST APIs to sync patient records and appointment schedules with most modern Hospital Information Systems."
          />
        </div>
      </section>

      {/* 10. PRICING SECTION */}
      <section className="py-32 max-w-7xl mx-auto px-6 text-center" id="pricing">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">Transparent Pricing. No Hidden SMS Fees.</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto">Other QMS platforms hide expensive per-SMS usage fees. QLink bundles unlimited WhatsApp alerts inside a predictable monthly cost.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
          <PricingCard
            name="Starter"
            price="₹1,999"
            desc="Perfect for single-doctor clinics moving off paper registers."
            features={["Unlimited Walk-ins", "Basic Queue Display", "Up to 500 WhatsApp Alerts"]}
          />
          <PricingCard
            name="Professional"
            price="₹4,999"
            desc="The standard for polyclinics. Zero hidden messaging costs."
            features={["Multi-Doctor Routing", "Smart TV Integration", "Unlimited WhatsApp Alerts", "Basic Analytics"]}
            isPopular
          />
          <PricingCard
            name="Enterprise"
            price="Custom"
            desc="API-first deployments for multi-branch hospital networks."
            features={["HIS / EMR Integrations", "Advanced Analytics Heatmaps", "SLA & Dedicated Support", "DPDP Private Instances"]}
            buttonText="Contact Sales"
            buttonVariant="outline"
          />
        </div>
      </section>

      {/* 12. FINAL CTA */}
      <section className="py-24 bg-indigo-600 dark:bg-indigo-900 text-white text-center px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">Ready to digitize your front desk?</h2>
          <p className="text-xl text-indigo-100 mb-10 font-medium">Join hundreds of modern clinics saving 10+ hours per week.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="h-16 px-10 rounded-full bg-white text-indigo-900 hover:bg-slate-100 font-black text-lg shadow-2xl">Start Free Trial Now</Button>
            </Link>
            <Link href="https://wa.me/919320201572?text=I%20want%20to%20have%20QLink%20software%20for%20my%20hospital." target="_blank">
              <Button size="lg" variant="outline" className="h-16 px-10 rounded-full border-2 border-indigo-400 text-white hover:bg-indigo-800 font-bold text-lg">Talk to Sales</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Subcomponents
function TrustBadge({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
      <div className="text-indigo-600 dark:text-indigo-400">{icon}</div> {text}
    </div>
  )
}

function StepCard({ step, title, desc, icon }: { step: string, title: string, desc: string, icon: React.ReactNode }) {
  return (
    <div className="p-8 rounded-3xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none hover:-translate-y-2 transition-transform duration-300">
      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center font-black text-xl mb-6 relative">
        {icon}
        <div className="absolute -top-3 -right-3 w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px]">{step}</div>
      </div>
      <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">{title}</h3>
      <p className="text-slate-600 dark:text-slate-400 font-medium text-sm leading-relaxed">{desc}</p>
    </div>
  )
}

function FeatureListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Icons.CheckCircle2 className="w-6 h-6 text-electric-cyan shrink-0" />
      <span className="font-bold text-slate-700 dark:text-slate-300">{children}</span>
    </li>
  )
}

function BenefitLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-electric-cyan"></div>
      <span className="text-slate-400 font-bold">{text}</span>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string, answer: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 transition-colors group">
      <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-electric-cyan transition-colors">{question}</h3>
      <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{answer}</p>
    </div>
  )
}

function AnalyticsCard({ title, value, trend, color }: { title: string, value: string, trend: string, color: string }) {
  return (
    <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-left">
      <p className="text-slate-400 font-bold text-sm uppercase mb-2">{title}</p>
      <h3 className="text-5xl font-black text-white tracking-tighter mb-4">{value}</h3>
      <p className={`font-bold text-sm ${color}`}>{trend}</p>
    </div>
  )
}

interface PricingCardProps {
  name: string;
  price: string;
  desc: string;
  features: string[];
  isPopular?: boolean;
  buttonText?: string;
  buttonVariant?: string;
}

function PricingCard({ name, price, desc, features, isPopular, buttonText = "Start Free Trial", buttonVariant = "default" }: PricingCardProps) {
  const ButtonComp = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const variantStr = buttonVariant as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    return (
      <Link href="/login" className="w-full">
        <Button className={className} variant={variantStr}>{children}</Button>
      </Link>
    );
  };

  return (
    <div className={`p-8 rounded-3xl flex flex-col h-full bg-white dark:bg-slate-900 border ${isPopular ? 'border-indigo-500 shadow-2xl shadow-indigo-600/10 scale-105 z-10' : 'border-slate-200 dark:border-slate-800'}`}>
      {isPopular && <div className="bg-indigo-600 text-white text-xs font-black uppercase tracking-widest text-center py-1 -mt-8 -mx-8 mb-8 rounded-t-3xl">Most Popular</div>}
      <h3 className="text-2xl font-black text-slate-900 dark:text-white">{name}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 h-10">{desc}</p>
      <div className="my-8">
        <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">{price}</span>
        {price !== "Custom" && <span className="text-slate-500 font-bold">/mo</span>}
      </div>
      <ul className="mb-10 space-y-4 flex-1">
        {features.map((f: string, i: number) => (
          <li key={i} className="flex items-start gap-3 text-sm font-bold text-slate-700 dark:text-slate-300">
            <Icons.CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      <ButtonComp className="w-full h-14 rounded-xl font-bold text-lg">{buttonText}</ButtonComp>
    </div>
  )
}

function MessageBubble({ children, from, highlight }: { children: React.ReactNode, from: "user" | "bot", highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${from === "user"
      ? "bg-[#D9FDD3] dark:bg-[#005C4B] self-end rounded-tr-sm text-slate-900 dark:text-indigo-50"
      : highlight
        ? "bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-500/30 self-start rounded-tl-sm text-slate-800 dark:text-indigo-100"
        : "bg-white dark:bg-[#202C33] self-start rounded-tl-sm text-slate-800 dark:text-slate-200"
      }`}>
      {children}
    </div>
  )
}
