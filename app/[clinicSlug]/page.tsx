
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClinicForm } from "./_components/ClinicForm";
import { ClinicStatusBadge } from "./_components/ClinicStatusBadge"; // Import Badge
import { Button } from "@/components/ui/button";
import { Lock, StopCircle, Phone } from "lucide-react";

// Force dynamic since we lookup by slug
export const dynamic = "force-dynamic";

interface PageProps {
    params: { clinicSlug: string };
}

async function getClinic(slug: string) {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('clinics')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

    if (error || !data) return null;
    return data;
}

export default async function ClinicLandingPage({ params }: PageProps) {
    const clinic = await getClinic(params.clinicSlug);

    if (!clinic) return notFound();

    // Fetch Today's Session Status
    const supabase = createClient();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { data: session } = await supabase.from('sessions').select('status').eq('clinic_id', clinic.id).eq('date', today).single();



    // Logic: If session exists AND status is CLOSED/PAUSED -> Block.
    // If session is null -> Open.

    const isClosedOrPaused = session && (session.status === 'CLOSED' || session.status === 'PAUSED');
    const statusMessage = session?.status === 'PAUSED' ? "Queue is currently paused." : "Queue is closed for today.";

    return (
        <main className="min-h-screen bg-slate-50 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                    {/* HEADER */}
                    <div className="bg-blue-600 p-8 text-center text-white relative">
                        {/* Sync Badge */}
                        <div className="absolute top-4 right-4">
                            <ClinicStatusBadge clinicSlug={params.clinicSlug} />
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight">{clinic.name}</h1>
                        <p className="text-slate-400 text-sm mt-1">Join the Queue</p>
                    </div>

                    <div className="p-6">
                        {isClosedOrPaused ? (
                            <div className="text-center py-8 space-y-6 animate-in fade-in zoom-in duration-300">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                                    {session?.status === 'PAUSED' ?
                                        <StopCircle className="h-10 w-10 text-orange-400" /> :
                                        <Lock className="h-10 w-10 text-slate-400" />
                                    }
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-slate-900">{statusMessage}</h3>
                                    <p className="text-slate-500 max-w-[200px] mx-auto leading-tight">Please check back later or contact the reception.</p>
                                </div>

                                <div className="pt-2">
                                    <a href="tel:+919876543210" className="block w-full">
                                        <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-14 text-lg rounded-2xl shadow-xl shadow-green-500/20 active:scale-95 transition-all">
                                            <Phone className="w-5 h-5 mr-2" /> Call Reception
                                        </Button>
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <ClinicForm clinicSlug={params.clinicSlug} />
                        )}
                    </div>

                    <div className="bg-blue-600 p-3 text-center text-xs text-white/80 font-bold tracking-widest uppercase border-t border-blue-500">
                        Powered by QLink
                    </div>
                </div>
            </div>
        </main>
    );
}
