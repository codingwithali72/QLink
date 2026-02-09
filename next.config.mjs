/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    compress: true,
    images: {
        formats: ['image/avif', 'image/webp'],
    },
    // Ensure we don't have heavy headers blocking
    poweredByHeader: false,
};

export default nextConfig;
