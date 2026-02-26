import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createClient = () => {
    const cookieStore = cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        const { maxAge, expires, ...sessionOptions } = options;
                        cookieStore.set({
                            name,
                            value,
                            ...sessionOptions,
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const,
                        });
                    } catch {
                        // The `set` method was called from a Server Component.
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        cookieStore.set({
                            name,
                            value: '',
                            ...options,
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const,
                        })
                    } catch {
                        // The `delete` method was called from a Server Component.
                    }
                },
            },
        }
    )
}
