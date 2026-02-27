import Link from "next/link";
import {
  MessageSquare, ShieldCheck,
  Smartphone, Tv, BarChart4, CheckCircle2,
  Building2, PlayCircle,
  ScanLine, RefreshCw, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-500/30">
      {/* 1. GLOBAL HEADER */}


      {/* 2. HERO SECTION */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 inset-x-0 h-full w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-slate-50 dark:from-indigo-900/20 dark:via-[#0B1120] dark:to-[#0B1120] -z-10"></div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] tracking-widest uppercase mb-8 shadow-sm border border-indigo-100 dark:border-indigo-800/50">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
            Hospital-Grade Queue Orchestration
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tighter text-slate-900 dark:text-white leading-[1.05] max-w-5xl mx-auto mb-6">
            End the Chaos. Reduce Clinic Wait Times by <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-400">50%.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
            The fully cloud-native, <strong className="text-slate-900 dark:text-white">app-free</strong> patient flow orchestration platform. Built natively on WhatsApp. Perfect for modern clinics and enterprise hospitals.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg font-bold rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20 hover:scale-105 transition-all duration-300">
                Start 14-Day Free Trial
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-bold rounded-full border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 transition-all duration-300 group">
              <PlayCircle className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" /> Calculate ROI
            </Button>
          </div>

          {/* HERO VISUAL MOCKUP (Split Screen Layout) */}
          <div className="mt-20 relative max-w-5xl mx-auto rounded-3xl border border-slate-200/50 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden p-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-min md:h-[500px] rounded-2xl overflow-hidden bg-slate-100/50 dark:bg-[#0B1120]/80">
              {/* Left: Beautiful TV Display Mockup */}
              <div className="p-6 md:p-10 flex flex-col h-full justify-between items-start border-r border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-400"></div>
                <div className="w-full flex justify-between items-center mb-10">
                  <div className="flex items-center gap-2"><Tv className="text-indigo-600 dark:text-indigo-400" /><span className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">Dr. Sharma&apos;s OPD</span></div>
                  <Badge>Main Queue</Badge>
                </div>
                <div className="w-full text-center py-10">
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Now Serving</p>
                  <h2 className="text-7xl font-black text-slate-900 dark:text-white tracking-tighter drop-shadow-sm group-hover:scale-110 transition-transform duration-500">#42</h2>
                  <p className="mt-4 text-xl font-bold text-slate-700 dark:text-slate-300">Rahul K.</p>
                </div>
                <div className="w-full bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 mt-auto flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">Up Next</p>
                    <p className="font-black text-slate-900 dark:text-white">#43 (Priya S.)</p>
                  </div>
                  <ScanLine className="w-8 h-8 text-indigo-400 opacity-50" />
                </div>
              </div>

              {/* Right: WhatsApp Mockup */}
              <div className="bg-[#EFEAE2] dark:bg-[#0c131d] p-6 relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.02]" style={{ backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_icon.png')", backgroundSize: '100px' }}></div>
                <div className="w-[300px] bg-[#EFEAE2] dark:bg-[#0B141A] rounded-[36px] shadow-2xl border-[8px] border-slate-800 dark:border-slate-950 flex flex-col h-full max-h-[450px] relative z-10 overflow-hidden transform hover:-translate-y-2 transition-transform duration-500">
                  <div className="bg-[#008069] dark:bg-[#202C33] p-4 text-white flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse"><Building2 className="w-4 h-4" /></div>
                    <div><p className="font-bold text-sm leading-tight">City Hospital</p><p className="text-[10px] opacity-80">Verified Business</p></div>
                  </div>
                  <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
                    <MessageBubble from="user">Hi, I want to join the queue.</MessageBubble>
                    <MessageBubble from="bot">Welcome! Which department would you like to visit today?</MessageBubble>
                    <MessageBubble from="user">Cardiology</MessageBubble>
                    <MessageBubble from="bot" highlight>
                      <strong>Confirmed! Your Token is #45.</strong><br /><br />
                      Estimated wait: 25 mins.<br />
                      There are 2 people ahead of you.<br /><br />
                      <em>We will notify you when it&apos;s your turn.</em>
                    </MessageBubble>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. TRUST BAND */}
      <section className="border-y border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-[#0f172a] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
          <TrustBadge icon={<ShieldCheck />} text="HIPAA & DPDP Compliant" />
          <TrustBadge icon={<MessageSquare />} text="Official WhatsApp Partner" />
          <TrustBadge icon={<Tv />} text="Hardware Agnostic" />
          <TrustBadge icon={<Zap />} text="Zero Latency Edge API" />
        </div>
      </section>

      {/* 4. THE PROBLEM SECTION */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">Stop punishing your patients.</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto">Physical waiting rooms breed anxiety, cross-infection, and terrible reviews. It&apos;s time to digitize your front desk.</p>
        </div>
      </section>

      {/* 5. HOW IT WORKS (Visual Journey) */}
      <section className="py-24 bg-slate-100/50 dark:bg-slate-900/20 border-y border-slate-200/50 dark:border-slate-800/50" id="features">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold tracking-widest text-xs uppercase">How QLink Works</span>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mt-2">Zero Friction. Total Autonomy.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <StepCard step="1" title="Scan & Join" desc="Patients scan a QR code at Reception. Zero App Downloads Required. WhatsApp opens instantly." icon={<ScanLine />} />
            <StepCard step="2" title="Virtual Waiting" desc="Patients track their exact, dynamic position in line from their smartphone, reducing front-desk inquiries." icon={<Smartphone />} />
            <StepCard step="3" title="Smart Routing" desc="Walk-ins and pre-booked appointments merge seamlessly into a single conflict-free Reception Dashboard." icon={<RefreshCw />} />
            <StepCard step="4" title="Patient Feedback" desc="Automated WhatsApp surveys capture real-time feedback immediately post-consultation." icon={<MessageSquare />} />
          </div>
        </div>
      </section>

      {/* 6. WHATSAPP & HARDWARE DOMINANCE */}
      <section className="py-32 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="w-16 h-16 bg-[#25D366]/10 text-[#25D366] rounded-2xl flex items-center justify-center mb-6"><MessageSquare className="w-8 h-8" /></div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900 dark:text-white leading-tight mb-6">
              Built on WhatsApp. <br />Used by Everyone.
            </h2>
            <ul className="space-y-4 mb-8 text-lg font-medium text-slate-600 dark:text-slate-400">
              <FeatureListItem>No proprietary apps for elderly patients to learn.</FeatureListItem>
              <FeatureListItem>No expensive SMS fees. Unlimited WhatsApp alerts included.</FeatureListItem>
              <FeatureListItem>Interactive Department & Doctor Selection right in the chat.</FeatureListItem>
            </ul>
            <Button className="bg-[#25D366] hover:bg-[#1DA851] text-white font-bold h-12 px-8 rounded-full shadow-lg shadow-[#25D366]/20">See WhatsApp Flow</Button>
          </div>

          <div className="p-10 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6"><Tv className="w-8 h-8" /></div>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white leading-tight mb-6">
              100% Hardware Agnostic
            </h2>
            <p className="text-slate-600 dark:text-slate-400 font-medium mb-8">
              Competitors force you to buy $10k proprietary kiosks and ticket printers. QLink runs purely in the browser.
            </p>
            <ul className="space-y-4 text-slate-700 dark:text-slate-300 font-bold text-sm">
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use existing Smart TVs</span> <CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use consumer Android Tablets</span> <CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
              <li className="flex justify-between items-center py-3 border-b border-slate-200 dark:border-slate-800">
                <span>Use current Reception Laptops</span> <CheckCircle2 className="text-green-500 w-5 h-5" />
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 8. ANALYTICS / SERVICE INTELLIGENCE */}
      <section className="py-24 bg-[#0B1120] text-white border-y border-slate-800 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-900/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center mb-16">
          <BarChart4 className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Command Center Analytics</h2>
          <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto">Transform your waiting room from a cost center into a business intelligence engine. Identify bottlenecks instantly.</p>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-6">
          <AnalyticsCard title="Average Wait Time" value="14 mins" trend="-32% this week" color="text-green-400" />
          <AnalyticsCard title="Patient Walk-aways" value="1.2%" trend="-80% this month" color="text-green-400" />
          <AnalyticsCard title="Doctor Utilization" value="94%" trend="Optimal Range" color="text-blue-400" />
        </div>
      </section>

      {/* 10. PRICING SECTION (Transparent Tiered) */}
      <section className="py-32 max-w-7xl mx-auto px-6" id="pricing">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-4">Transparent Pricing. No Hidden SMS Fees.</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto">Other QMS platforms hide expensive per-SMS usage fees. QLink bundles unlimited WhatsApp alerts inside a predictable monthly cost.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
            <Button size="lg" className="h-16 px-10 rounded-full bg-white text-indigo-900 hover:bg-slate-100 font-black text-lg shadow-2xl">Start Free Trial Now</Button>
            <Button size="lg" variant="outline" className="h-16 px-10 rounded-full border-2 border-indigo-400 text-white hover:bg-indigo-800 font-bold text-lg">Talk to Sales</Button>
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
      <CheckCircle2 className="w-6 h-6 text-[#25D366] shrink-0" />
      <span>{children}</span>
    </li>
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
            <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      <Button className={`w-full h-14 rounded-xl font-bold text-lg ${buttonVariant === 'outline' ? 'border-2' : ''}`} variant={buttonVariant as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"}>{buttonText}</Button>
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
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-black uppercase tracking-widest rounded-full">{children}</span>
}
