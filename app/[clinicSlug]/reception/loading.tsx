import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 pb-20 md:p-6 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
                {/* Header Skeleton */}
                <div className="h-20 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800"></div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    {/* Left Col */}
                    <div className="xl:col-span-8 space-y-6">
                        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-3xl"></div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="col-span-2 h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
                            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
                            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
                        </div>
                    </div>

                    {/* Right Col */}
                    <div className="xl:col-span-4 space-y-6">
                        <div className="h-14 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                        <div className="h-[400px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800"></div>
                    </div>
                </div>
            </div>
            <div className="fixed bottom-4 right-4 flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold">Loading Dashboard...</span>
            </div>
        </div>
    );
}
