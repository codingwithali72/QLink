/* eslint-disable react/no-unescaped-entities */
import { ShieldCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><ShieldCheck className="w-6 h-6" /></div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Privacy Policy</h1>
                </div>
                <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-slate-600 dark:text-slate-400 font-medium">
                    <p className="text-xl text-slate-900 dark:text-white font-bold">Your privacy is our clinical priority.</p>
                    <p>At QLink, we understand that we handle sensitive health data. This policy outlines how we collect, protect, and use information when you use our OPD orchestration services.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">1. Data Minimization</h2>
                    <p>We only collect what is strictly necessary to manage the clinical queue. This includes patient phone numbers for WhatsApp notifications and visit-specific identifiers.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">2. Clinical Encryption</h2>
                    <p>All data is encrypted in transit via TLS 1.3 and at rest via AES-256. We utilize AWS KMS for secure key management.</p>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white pt-8">3. DPDP & HIPAA Compliance</h2>
                    <p>We are fully aligned with the Digital Personal Data Protection (DPDP) Act of India and maintain HIPAA-ready infrastructure for global healthcare providers.</p>
                </div>
            </section>
        </div>
    );
}
