import Link from "next/link";
import { ChevronRight, MessageSquare, ShieldCheck, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">

      {/* STICKY NAV */}
      <nav className="sticky top-0 z-50 w-full p-4 md:p-6 backdrop-blur-md bg-white/70 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20">Q</div>
            <span className="font-extrabold text-2xl tracking-tighter text-slate-900 dark:text-white">QLink</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <ModeToggle />
            <Link href="/login">
              <Button variant="ghost" className="font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                Staff Login
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="flex-1 flex flex-col items-center">

        {/* Hero Content */}
        <section className="w-full relative py-20 md:py-32 flex flex-col items-center text-center px-6 overflow-hidden">
          {/* Background Atmosphere */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl blur-3xl opacity-20 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-500 rounded-full animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-cyan-400 rounded-full animate-pulse delay-700"></div>
          </div>

          <div className="max-w-4xl relative z-10 space-y-8">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="px-5 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-[0.25em] border border-indigo-100 dark:border-indigo-800/50 block w-fit mx-auto shadow-sm">
                Smart Healthcare Logistics
              </span>
            </div>

            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
              <h1 className="text-5xl md:text-8xl font-black tracking-tight text-slate-900 dark:text-white leading-[0.95] md:leading-[0.9]">
                Queueless Clinics.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-300">Happier Patients.</span>
              </h1>
            </div>

            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              The wait ends here. QLink provides real-time virtual queue management, live WhatsApp turn-tracking, and business intelligence for healthcare providers.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
              <Link href="/admin">
                <Button size="lg" className="rounded-2xl h-16 px-10 text-lg font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-600/30 hover:scale-105 transition-all">
                  Management Dashboard <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="w-full max-w-7xl px-6 py-20 border-t border-slate-100 dark:border-slate-900 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: <MessageSquare className="w-6 h-6" />,
              title: "Live WA Integration",
              text: "Patients join the queue by simply sending a text. They get live updates while they wait at home or in a cafe.",
              color: "bg-emerald-500/10 text-emerald-600"
            },
            {
              icon: <Activity className="w-6 h-6" />,
              title: "Real-time Dashboard",
              text: "Staff can manage tokens, skip emergency cases, and monitor the queue pace with a zero-latency reception system.",
              color: "bg-indigo-500/10 text-indigo-600"
            },
            {
              icon: <ShieldCheck className="w-6 h-6" />,
              title: "Enterprise Security",
              text: "Multi-tenant isolation for healthcare groups. Secure data handling with DPDP compliant retention logic.",
              color: "bg-amber-500/10 text-amber-600"
            }
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${f.color}`}>{f.icon}</div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">{f.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{f.text}</p>
            </div>
          ))}
        </section>

      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-7xl mx-auto p-12 flex flex-col md:flex-row items-center justify-between border-t border-slate-100 dark:border-slate-900 gap-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black">Q</div>
          <span className="font-bold text-lg dark:text-white">QLink Infrastructure</span>
        </div>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
          © 2026 QLink. All Rights Reserved. Specialized Smart Queueing.
        </p>
      </footer>
    </div>
  );
}
