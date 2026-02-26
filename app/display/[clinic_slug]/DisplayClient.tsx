'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DisplayClientProps {
    clinicName: string;
    initialSessionId: string;
    initialNowServing: number;
    initialWaitingCount: number;
    initialNextToken: number | string;
    isPaused: boolean;
}

export default function DisplayClient({
    clinicName,
    initialSessionId,
    initialNowServing,
    initialWaitingCount,
    initialNextToken,
    isPaused: initialIsPaused
}: DisplayClientProps) {
    const supabase = createClient()
    const [nowServing, setNowServing] = useState(initialNowServing)
    const [waitingCount, setWaitingCount] = useState(initialWaitingCount)
    const [nextToken, setNextToken] = useState(initialNextToken)
    const [isPaused, setIsPaused] = useState(initialIsPaused)

    useEffect(() => {
        // Polling every 3 seconds for robust real-time feel (QLink preferred over WebSocket)
        const fetchState = async () => {
            const { data: session } = await supabase
                .from('sessions')
                .select('status, now_serving_number')
                .eq('id', initialSessionId)
                .single()

            if (session) {
                setIsPaused(session.status === 'PAUSED')
                setNowServing(session.now_serving_number)
            }

            const { data: tokens } = await supabase
                .from('tokens')
                .select('token_number, status, is_priority')
                .eq('session_id', initialSessionId)
                .in('status', ['WAITING', 'SERVING'])

            if (tokens) {
                setWaitingCount(tokens.filter(t => t.status === 'WAITING').length)

                // Find next token prioritizing emergencies, then token_number
                const waitingTokens = tokens.filter(t => t.status === 'WAITING');
                waitingTokens.sort((a, b) => {
                    if (a.is_priority === b.is_priority) return a.token_number - b.token_number;
                    return a.is_priority ? -1 : 1;
                });

                setNextToken(waitingTokens[0]?.token_number || '-')
            }
        }

        const interval = setInterval(fetchState, 3000)
        return () => clearInterval(interval)
    }, [initialSessionId, supabase])

    return (
        <div className="flex flex-col h-screen w-screen bg-slate-900 text-white font-sans overflow-hidden">
            <header className="py-6 px-10 bg-slate-800 flex justify-between items-center shadow-lg">
                <h1 className="text-4xl font-bold tracking-tight">{clinicName}</h1>
                <div className="text-2xl font-medium text-slate-300">Live StatusQueue Display</div>
            </header>

            <main className="flex-1 p-10 flex gap-8">
                {/* Now Serving (Main Focus) */}
                <div className="flex-1 bg-blue-600 rounded-3xl shadow-2xl flex flex-col justify-center items-center relative overflow-hidden">
                    {isPaused && (
                        <div className="absolute top-0 w-full bg-yellow-500 text-yellow-950 text-center font-bold py-3 text-xl uppercase tracking-widest">
                            Session Paused (Delay)
                        </div>
                    )}
                    <h2 className="text-5xl font-semibold mb-6 text-blue-100 uppercase tracking-wider">Now Serving</h2>
                    <div className="text-[12rem] font-bold leading-none drop-shadow-xl">
                        {nowServing || '-'}
                    </div>
                </div>

                {/* Queue Stats Widget */}
                <div className="w-1/3 flex flex-col gap-8">
                    <div className="flex-1 bg-slate-800 rounded-3xl shadow-xl flex flex-col justify-center items-center border border-slate-700">
                        <h2 className="text-3xl text-slate-400 mb-2 font-medium">Next In Line</h2>
                        <div className="text-8xl font-bold text-green-400">
                            {nextToken}
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-800 rounded-3xl shadow-xl flex flex-col justify-center items-center border border-slate-700">
                        <h2 className="text-3xl text-slate-400 mb-2 font-medium">Waiting Patients</h2>
                        <div className="text-8xl font-bold text-amber-400">
                            {waitingCount}
                        </div>
                    </div>
                </div>
            </main>

            <footer className="text-center py-4 text-slate-500 text-lg">
                To join, send <span className="font-mono text-slate-300">JOIN_{clinicName.replace(/\\s+/g, '').toUpperCase()}</span> to our WhatsApp
            </footer>
        </div>
    )
}
