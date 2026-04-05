import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@xyflow/react"],
  },
  async redirects() {
    return [
      // Legacy GEDCOM-based family routes → workspace tree views
      { source: '/saeed', destination: '/workspaces/saeed/tree', permanent: true },
      { source: '/sharbek', destination: '/workspaces/sharbek/tree', permanent: true },
      { source: '/al-dalati', destination: '/workspaces/al-dalati/tree', permanent: true },
      { source: '/al-dabbagh', destination: '/workspaces/al-dabbagh/tree', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
