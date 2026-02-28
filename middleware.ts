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

    if (isTv) {
        if (!url.pathname.startsWith("/tv")) {
            url.pathname = `/tv${url.pathname}`;
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
                        request.cookies.set({ name, value, ...options })
                        response = NextResponse.next({
                            request: {
                                headers: request.headers,
                            },
                        })
                        response.cookies.set({ name, value, ...options })
                    },
                    remove(name: string, options: CookieOptions) {
                        request.cookies.set({ name, value: '', ...options })
                        response = NextResponse.next({
                            request: {
                                headers: request.headers,
                            },
                        })
                        response.cookies.set({ name, value: '', ...options })
                    },
                },
            }
        )

        // Enforce Authentication on App Subdomain
        const { data: { user } } = await supabase.auth.getUser()

        // Protect Reception / Admin routes
        const isAdminRoute = request.nextUrl.pathname.includes('/admin');
        const isReceptionRoute = request.nextUrl.pathname.includes('/reception');
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@qlink.com";

        if ((isAdminRoute || isReceptionRoute) && !user) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            return NextResponse.redirect(loginUrl);
        }

        // Fix 3: Role protection for /admin
        if (isAdminRoute && user && user.email !== ADMIN_EMAIL) {
            console.warn(`Unauthorized admin access attempt by ${user.email}`);
            const homeUrl = request.nextUrl.clone();
            homeUrl.pathname = '/'; // Redirect to their landing page/dashboard
            return NextResponse.redirect(homeUrl);
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
