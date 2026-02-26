import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 h-[600px] animate-pulse">
                <div className="bg-slate-200 h-32 w-full"></div>
                <div className="p-6 space-y-4">
                    <div className="h-10 bg-slate-200 rounded-lg w-full"></div>
                    <div className="h-10 bg-slate-200 rounded-lg w-full"></div>
                    <div className="h-12 bg-slate-300 rounded-lg w-full mt-8"></div>
                </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Clinic...</span>
            </div>
        </div>
    );
}
