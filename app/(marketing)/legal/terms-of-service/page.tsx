/* eslint-disable react/no-unescaped-entities */
import { Scale } from "lucide-react";

export default function TermsOfServicePage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Scale className="w-6 h-6" /></div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Terms of Service</h1>
                </div>
                <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-slate-600 dark:text-slate-400 font-medium font-sans">
                    <p className="text-lg font-bold text-slate-900 dark:text-white leading-relaxed">By using QLink, you agree to our clinical orchestration standards.</p>
                    <p>These terms govern your use of the QLink platform, including the Dashboard, WhatsApp bot integration, and Digital Signage modules.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">1. Service Level Agreement</h2>
                    <p>We strive for 99.9% uptime for our core orchestration engine. Maintenance windows are typically scheduled during low-traffic hours and communicated 48 hours in advance.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">2. Fair Use Policy</h2>
                    <p>WhatsApp message volumes are subject to the specific plan limits. Any misuse of the messaging API for marketing outside of clinical queue updates may result in account review.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">3. Data Residency</h2>
                    <p>Customer data is stored in the region specified during setup (defaulting to India-South for local tenants) to ensure compliance with local medical record regulations.</p>
                </div>
            </section>
        </div>
    );
}
