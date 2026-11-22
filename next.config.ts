import type { NextConfig } from 'next';

/** Signed-in application pages share the instance origin; keep them out of search results. */
const PRIVATE_PATHS = [
  '/login',
  '/reset-password',
  '/library/:path*',
  '/read/:path*',
  '/media/:path*',
  '/settings',
  '/connections',
  '/ask',
  '/graph',
  '/highlights',
  '/connect/:path*',
  '/api/:path*',
];

const config: NextConfig = {
  output: 'standalone',
  agentRules: false,
  images: { unoptimized: true },
  experimental: { globalNotFound: true, webpackMemoryOptimizations: true },
  serverExternalPackages: [
    '@electric-sql/pglite',
    '@electric-sql/pglite-pgvector',
    'pg',
    'jsdom',
    'unpdf',
    '@napi-rs/canvas',
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      ...PRIVATE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
};
export default config;
