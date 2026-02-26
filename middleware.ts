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
    const isApp = hostname.startsWith("app.") || hostname.includes("qlink-zeta.vercel.app"); // Hobby Tier Fallback
    const isTv = hostname.startsWith("tv.");
    const isWebhook = hostname.startsWith("webhook.");

    // ---- SUBDOMAIN REWRITES ----
    if (isApi || isWebhook) {
        // Force /api prefix if not present natively. 
        if (!url.pathname.startsWith("/api")) {
            url.pathname = `/api${url.pathname}`;
            return NextResponse.rewrite(url);
        }
    } else if (isTv) {
        url.pathname = `/(tv)${url.pathname}`;
        return NextResponse.rewrite(url);
    } else if (isApp) {
        // If it's a Vercel root and the user is hitting / (home), show marketing.
        // Otherwise, rewrite to /(app) for Dashboard/Admin.
        if (url.pathname === "/" && !hostname.startsWith("app.")) {
            url.pathname = `/(marketing)/`;
            return NextResponse.rewrite(url);
        }
        url.pathname = `/(app)${url.pathname}`;
        // DO NOT RETURN YET, app requires Auth evaluation
    } else {
        // Marketing Site (qlink.com or anything else)
        if (url.pathname === "/") {
            url.pathname = `/(marketing)${url.pathname}`;
            return NextResponse.rewrite(url);
        }
    }


    let response = isApp ? NextResponse.rewrite(url) : NextResponse.next();

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
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { maxAge, ...sessionOptions } = options;

                        const secureOptions = {
                            ...sessionOptions,
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'lax' as const, // Lax for OAuth compat, Strict if standalone
                            domain: process.env.NODE_ENV === 'production' ? '.qlink.com' : 'localhost'
                        };

                        request.cookies.set({ name, value, ...secureOptions })
                        response = NextResponse.rewrite(url) // Regenerate response with cookies
                        response.cookies.set({ name, value, ...secureOptions })
                    },
                    remove(name: string, options: CookieOptions) {
                        const secureOptions = {
                            ...options,
                            domain: process.env.NODE_ENV === 'production' ? '.qlink.com' : 'localhost'
                        };
                        request.cookies.set({ name, value: '', ...secureOptions })
                        response = NextResponse.rewrite(url)
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
