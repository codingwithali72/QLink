/* eslint-disable react/no-unescaped-entities */
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, MapPin } from "lucide-react";

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-cloud-dancer dark:bg-[#0B1120] font-sans selection:bg-electric-cyan/30">
            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 max-w-5xl mx-auto text-center">
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 dark:text-white mb-6 leading-[0.95]">
                    Let&apos;s Build the <br />
                    <span className="text-indigo-600">Future of Care.</span>
                </h1>
                <p className="text-xl text-slate-600 dark:text-slate-400 font-medium max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                    Whether you&apos;re a single-doctor clinic or a multi-branch hospital network, we&apos;re here to help you orchestrate your patient flow.
                </p>
            </section>

            {/* Contact Grid */}
            <section className="py-24 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                    <ContactItem icon={<Mail className="text-indigo-500" />} title="Email Us" detail="enterprise@qlink.health" />
                    <ContactItem icon={<MessageSquare className="text-indigo-500" />} title="WhatsApp Support" detail="+91 800-ORCHESTRATE" />
                    <ContactItem icon={<MapPin className="text-indigo-500" />} title="Headquarters" detail="Level 4, Clinical Tech Park, Bangalore, India" />
                </div>
                <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Send a Message</h3>
                    <div className="space-y-4">
                        <input type="text" placeholder="Full Name" className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <input type="email" placeholder="Work Email" className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <textarea placeholder="How can we help?" className="w-full h-40 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
                        <Button className="w-full h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg">Send Inquiry</Button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function ContactItem({ icon, title, detail }: { icon: React.ReactNode, title: string, detail: string }) {
    return (
        <div className="flex gap-6 items-center">
            <div className="w-14 h-14 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-800 shadow-xl">{icon}</div>
            <div>
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">{title}</h4>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{detail}</p>
            </div>
        </div>
    );
}
