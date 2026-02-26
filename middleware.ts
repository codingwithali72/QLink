import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const url = request.nextUrl.clone();
    let hostname = request.headers.get("host") || "";

    // Allow local testing over localhost
    if (hostname.includes("localhost")) {
        hostname = "app.qlink.com"; // Default to app for local dev if not specified
    }

    const isApi = hostname.startsWith("api.");
    const isTv = hostname.startsWith("tv.");
    const isWebhook = hostname.startsWith("webhook.");
    const isApp = hostname.startsWith("app.") || hostname.includes("qlink-zeta.vercel.app");

    // ---- SUBDOMAIN REWRITES ----
    if (isApi || isWebhook) {
        if (!url.pathname.startsWith("/api")) {
            url.pathname = `/api${url.pathname}`;
            return NextResponse.rewrite(url);
        }
    }

    // On Hobby Tier (root domain), paths like /login or /admin work naturally.
    // We only need to enforce authentication on them.

    let response = NextResponse.next();

    // ---- SUPABASE AUTH & COOKIE SCOPING (ONLY FOR APP SUBDOMAIN) ----
    if (isApp) {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return request.cookies.get(name)?.value
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        const { maxAge, ...sessionOptions } = options;
                        const secureOptions = {
                            ...sessionOptions,
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const,
                        };

                        request.cookies.set({ name, value, ...secureOptions })
                        response = NextResponse.next()
                        response.cookies.set({ name, value, ...secureOptions })
                    },
                    remove(name: string, options: CookieOptions) {
                        const secureOptions = {
                            ...options,
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const,
                        };
                        request.cookies.set({ name, value: '', ...secureOptions })
                        response = NextResponse.next()
                        response.cookies.set({ name, value: '', ...secureOptions })
                    },
                },
            }
        )

        // Enforce Authentication on App Subdomain
        const { data: { user } } = await supabase.auth.getUser()

        // Protect Reception / Admin routes
        const isAuthRoute = request.nextUrl.pathname.includes('/reception') || request.nextUrl.pathname.includes('/admin');

        if (isAuthRoute && !user) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            // Need to return a redirect, not a rewrite, to update browser URL
            return NextResponse.redirect(loginUrl);
        }
    }

    // ---- SECURITY HEADERS ----
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ---- RATE LIMITING ----
    if (request.nextUrl.pathname.includes('/actions') && request.method === 'POST') {
        const lastRequest = request.cookies.get('qlink_rate_limit');
        const now = Date.now();

        if (lastRequest && (now - parseInt(lastRequest.value) < 2000)) {
            return new NextResponse(JSON.stringify({ error: "Too many requests. Please wait." }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        response.cookies.set('qlink_rate_limit', now.toString(), { maxAge: 60 });
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
