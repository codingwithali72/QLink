
import Link from "next/link";
import { LayoutDashboard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">

      {/* NAVBAR */}
      <nav className="w-full p-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">Q</div>
          <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">QLink</span>
        </div>
        <div className="flex items-center gap-4">
          <ModeToggle />
          <Link href="/prime-care/reception">
            <Button variant="ghost" className="font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400">
              Staff Login
            </Button>
          </Link>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-4xl relative z-10 space-y-10">

          {/* Pill Label */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-widest border border-blue-200 dark:border-blue-800/50">
              Queue Management System
            </span>
          </div>

          {/* Main Tagline */}
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 dark:text-white leading-[0.9]">
              BE QUEUELESS
            </h1>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-300 leading-[0.9]">
              NOT CLUELESS
            </h1>
          </div>

          {/* Subtext */}
          <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            Eliminate waiting rooms with intelligent, real-time token tracking.
            Join from home, relax, and track your turn instantly.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            <Link href="/prime-care">
              <Button size="lg" className="rounded-full h-14 px-8 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40 transition-all">
                Get Token <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </Link>
            <Link href="/prime-care/reception">
              <Button size="lg" variant="outline" className="rounded-full h-14 px-8 text-lg font-bold border-2 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent">
                <LayoutDashboard className="w-5 h-5 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full p-8 text-center border-t border-slate-200 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
          Powered by QLink Infrastructure
        </p>
      </footer>
    </div>
  );
}
