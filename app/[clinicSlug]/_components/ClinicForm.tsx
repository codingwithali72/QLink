"use client";

import { useState, useEffect } from "react";
// import { useRouter } from "next/navigation"; // DISABLED
import { createToken } from "@/app/actions/queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, StopCircle, Phone } from "lucide-react";

export function ClinicForm({ clinicSlug }: { clinicSlug: string }) {
    const [loading, setLoading] = useState(false);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await createToken(clinicSlug, phone, name);
            if (res.token) {
                // Use window.location instead of router to avoid context issues
                window.location.href = `/${clinicSlug}/t/${res.token.id}`;
            } else {
                if (res.error === "Clinic is closed" || res.error === "Queue is currently paused") {
                    setStatusMessage(res.error === "Clinic is closed" ? "Queue is closed for today." : "Queue is currently paused.");
                } else {
                    setError(res.error || "Failed to create ticket");
                }
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            setError("Something went wrong");
            setLoading(false);
        }
    };

    if (statusMessage) {
        return (
            <div className="text-center py-8 space-y-6 animate-in fade-in zoom-in duration-300">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                    {statusMessage.includes('paused') ?
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
        );
    }



    return (
        <form onSubmit={handleSubmit} className="space-y-4 relative pt-2">
            {isOffline && (
                <div className="bg-yellow-50 text-yellow-800 text-xs px-2 py-1 rounded text-center mb-2 animate-in fade-in">
                    You appear to be offline.
                </div>
            )}
            <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-700">Mobile Number</Label>
                <Input
                    id="phone"
                    placeholder="98765 43210"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-12 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-500"
                    style={{ colorScheme: 'light' }}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-700">Your Name (Optional)</Label>
                <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-500"
                    style={{ colorScheme: 'light' }}
                />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button type="submit" size="lg" className="w-full h-12 text-lg bg-black hover:bg-slate-800 text-white" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" /> : "Get Token"}
            </Button>
        </form>
    );
}
