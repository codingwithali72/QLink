import { createAdminClient } from '@/lib/supabase/admin'
import DisplayClient from './DisplayClient'
import { notFound } from 'next/navigation'

export const revalidate = 0 // Disable cache for this page

export default async function SmartTVDisplay({
    params
}: {
    params: { clinic_slug: string }
}) {
    const supabase = createAdminClient()

    // 1. Fetch Business
    const { data: business } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('slug', params.clinic_slug)
        .eq('is_active', true)
        .single()

    if (!business) {
        return notFound()
    }

    // 2. Fetch today's session
    const todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    const dateString = new Date(todayIST).toISOString().split('T')[0]

    const { data: session } = await supabase
        .from('sessions')
        .select('id, now_serving_number, status')
        .eq('business_id', business.id)
        .eq('date', dateString)
        .in('status', ['OPEN', 'PAUSED'])
        .single()

    if (!session) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
                <h1 className="text-4xl font-bold">{business.name} is currently closed.</h1>
            </div>
        )
    }

    // 3. Fetch token context (Waiters & serving)
    const { data: tokens } = await supabase
        .from('tokens')
        .select('id, token_number, status, is_priority')
        .eq('session_id', session.id)
        .in('status', ['WAITING', 'SERVING'])
        .order('is_priority', { ascending: false })
        .order('token_number', { ascending: true })

    const waitingCount = tokens?.filter(t => t.status === 'WAITING').length || 0
    const nowServing = session.now_serving_number || 0
    const nextToken = tokens?.find(t => t.status === 'WAITING')?.token_number || '-'

    return (
        <DisplayClient
            clinicName={business.name}
            initialSessionId={session.id}
            initialNowServing={nowServing}
            initialWaitingCount={waitingCount}
            initialNextToken={nextToken}
            isPaused={session.status === 'PAUSED'}
        />
    )
}
