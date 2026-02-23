/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    compress: true,
    images: {
        formats: ['image/avif', 'image/webp'],
    },
    poweredByHeader: false,

    // ── Security Headers (DPDP + OWASP hardening) ────────────────────────────
    // Applied to every response. Enforces HTTPS, prevents clickjacking,
    // stops MIME sniffing, restricts referrer leakage, limits browser features.
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    // Force HTTPS for 2 years, include subdomains, enable preload list
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    // Prevent clickjacking — page cannot be embedded in an iframe
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    // Stop browsers from MIME-sniffing — only serve declared content-type
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    // Only send referrer for same-origin; strip it for cross-origin
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    // Disable camera, microphone, geolocation, payment APIs — none needed
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), payment=()',
                    },
                    // Content Security Policy:
                    // - default: self only
                    // - scripts: self + unsafe-inline (required by Next.js hydration)
                    // - connect: self + Supabase (realtime + REST)
                    // - fonts: Google Fonts CDN
                    // - frame-ancestors: none (belt-and-suspenders with X-Frame-Options)
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js requires these
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com",
                            "img-src 'self' data: blob:",
                            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
                            "frame-ancestors 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                        ].join('; '),
                    },
                    // XSS Protection header (legacy browsers — modern browsers use CSP)
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
