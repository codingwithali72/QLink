import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 dark:text-white mb-6">
                Contact
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mb-10">
                This page is part of the QLink marketing architecture. Detailed content for the Contact use-case applies here.
            </p>
            <div className="flex gap-4 items-center justify-center">
                <Link href="/pricing"><Button variant="outline" size="lg">View Pricing</Button></Link>
                <Link href="/login"><Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full">Start Free Trial</Button></Link>
            </div>
        </div>
    );
}
