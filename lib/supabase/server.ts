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
                        const isProd = process.env.NODE_ENV === 'production';
                        const secureOptions = {
                            ...options,
                            httpOnly: true,
                            secure: isProd,
                            sameSite: 'lax' as const,
                            domain: isProd ? '.qlink.com' : 'localhost'
                        };

                        // FORCE SESSION COOKIE: Remove maxAge and expires so it clears on browser close
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { maxAge, expires, ...sessionOptions } = secureOptions;
                        cookieStore.set({ name, value, ...sessionOptions });
                    } catch {
                        // The `set` method was called from a Server Component.
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        const isProd = process.env.NODE_ENV === 'production';
                        const secureOptions = {
                            ...options,
                            httpOnly: true,
                            secure: isProd,
                            sameSite: 'lax' as const,
                            domain: isProd ? '.qlink.com' : 'localhost'
                        };
                        cookieStore.set({ name, value: '', ...secureOptions })
                    } catch {
                        // The `delete` method was called from a Server Component.
                    }
                },
            },
        }
    )
}
