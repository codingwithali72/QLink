import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { ClinicStatusBadge } from "./_components/ClinicStatusBadge";
import { Button } from "@/components/ui/button";
import { Phone, ShieldCheck } from "lucide-react";
import { getClinicDate } from "@/lib/date";

export const dynamic = "force-dynamic";

interface PageProps {
    params: { clinicSlug: string };
}

async function getBusiness(slug: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('businesses')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

    if (error || !data) return null;
    return data;
}

export default async function ClinicLandingPage({ params }: PageProps) {
    const business = await getBusiness(params.clinicSlug);

    if (!business) return notFound();








    return (
        <main className="min-h-screen bg-slate-50 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                    {/* HEADER */}
                    <div className="bg-blue-600 p-8 text-center text-white relative">
                        <div className="absolute top-4 right-4">
                            <ClinicStatusBadge />
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight">{business.name}</h1>
                        <p className="text-slate-400 text-sm mt-1">Join the Queue</p>
                    </div>

                    <div className="p-6">

                        <div className="text-center py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* QR CODE SIMULATION */}
                            <div className="relative inline-block">
                                <div className="w-48 h-48 bg-white p-4 rounded-3xl shadow-inner border-2 border-slate-100 mx-auto flex items-center justify-center">
                                    <div className="w-40 h-40 bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://wa.me/919320201571?text=JOIN_${params.clinicSlug}')] bg-contain bg-no-repeat bg-center"></div>
                                </div>
                                <div className="absolute -bottom-3 -right-3 bg-blue-600 p-2 rounded-xl shadow-lg border-4 border-white">
                                    <Phone className="w-5 h-5 text-white" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-slate-900">WhatsApp Only Registration</h3>
                                <p className="text-slate-500 text-sm max-w-[280px] mx-auto leading-relaxed">
                                    Scan the QR code or click the button below to join the live queue via WhatsApp.
                                </p>
                            </div>

                            <div className="pt-2 space-y-4">
                                <a
                                    href={`https://wa.me/919320201571?text=JOIN_${params.clinicSlug}`}
                                    className="block w-full"
                                >
                                    <Button className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-black h-16 text-lg rounded-2xl shadow-xl shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-3">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.435 5.632 1.435h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                        JOIN ON WHATSAPP
                                    </Button>
                                </a>

                                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-left">
                                    <h4 className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5" /> DPDP Compliant
                                    </h4>
                                    <p className="text-[10px] text-blue-700 leading-relaxed">
                                        By joining via WhatsApp, you consent to our processing of your phone number solely for queue management. Your data is automatically deleted after 30 days.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>


                    <div className="bg-blue-600 p-3 text-center text-xs text-white/80 font-bold tracking-widest uppercase border-t border-blue-500">
                        Powered by QLink
                    </div>
                </div>
            </div>
        </main>
    );
}
