import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden h-[600px] animate-pulse">
                <div className="bg-slate-200 h-48 w-full"></div>
                <div className="p-6 space-y-6">
                    <div className="h-24 bg-slate-100 rounded-xl w-full"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-24 bg-slate-100 rounded-2xl"></div>
                        <div className="h-24 bg-slate-100 rounded-2xl"></div>
                    </div>
                    <div className="h-12 bg-slate-200 rounded-xl w-full"></div>
                </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Token...</span>
            </div>
        </div>
    );
}
