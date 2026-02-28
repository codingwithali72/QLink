/* eslint-disable react/no-unescaped-entities */


export default function CaseStudiesPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Real Impact. <br />
                    <span className="text-indigo-600">Hard Numbers.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
                    Explore how leading hospitals and clinics across the globe transformed their patient journey with QLink.
                </p>
            </section>

            {/* Case Study Cards */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <CaseStudyCard
                    title="City Care Super-Specialty"
                    metric="42% Reduction in Wait Time"
                    desc="How a 300-bed hospital eliminated lobby chaos by moving 95% of token generation to WhatsApp."
                />
                <CaseStudyCard
                    title="Green Valley Family Clinic"
                    metric="₹8.4L Reclaimed Revenue"
                    desc="By reducing no-shows via automated WhatsApp reminders, this single-doctor clinic maximized daily billing."
                />
            </section>
        </div>
    );
}

function CaseStudyCard({ title, metric, desc }: { title: string, metric: string, desc: string }) {
    return (
        <div className="p-10 rounded-[2.5rem] bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xl shadow-indigo-500/5 hover:-translate-y-2 transition-transform">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase mb-6">
                Success Story
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{title}</h3>
            <p className="text-indigo-600 dark:text-indigo-400 font-black text-xl mb-4 italic">{metric}</p>
            <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
        </div>
    );
}
