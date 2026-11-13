/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxy API calls so the session cookie is first-party to the dashboard
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl.replace(/\/$/, '')}/api/:path*` }];
  },
};

module.exports = nextConfig;
