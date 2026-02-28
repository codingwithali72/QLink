/* eslint-disable react/no-unescaped-entities */
import { ArrowRight } from "lucide-react";

export default function BlogPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-5xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest mb-8">
                    Clinical Insights & News
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    The OPD <br />
                    <span className="text-indigo-600">Orchestration Blog.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-3xl mx-auto mb-10 leading-relaxed">
                    Thought leadership on patient flow, clinical efficiency, and the future of virtual healthcare delivery in India.
                </p>
            </section>

            {/* Featured Articles */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <BlogCard
                    title="The 20-Minute Threshold: Why Patients Walk Out"
                    category="Operations"
                    desc="An analysis of patient attrition rates vs physical lobby wait times in Tier-1 city hospitals."
                />
                <BlogCard
                    title="WhatsApp vs proprietary Apps: The UX Verdict"
                    category="Technology"
                    desc="Why healthcare providers are ditching 'Book an App' buttons for 'Join via WhatsApp' QR codes."
                />
                <BlogCard
                    title="DPDP Act 2023: What it means for your Clinic"
                    category="Security"
                    desc="A clinician&apos;s guide to navigating India&apos;s new data protection laws without slowing down service."
                />
            </section>
        </div>
    );
}

function BlogCard({ title, category, desc }: { title: string, category: string, desc: string }) {
    return (
        <div className="group p-8 rounded-[2.5rem] bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xl hover:-translate-y-2 transition-all">
            <span className="text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest block mb-4">{category}</span>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 group-hover:text-indigo-600 transition-colors tracking-tight leading-tight">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed mb-8">{desc}</p>
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                Read Article <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    );
}
