/** @type {import('next').NextConfig} */
const nextConfig = {
  // Browser tests build into their own folder (npm run build:e2e) with the
  // TEST Supabase project baked in, so the normal .next build is never
  // overwritten by one that points elsewhere.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The per-role user guide PDFs are read from disk by src/app/user-guide/route.ts
  // (kept out of /public so only signed-in people can open them).
  outputFileTracingIncludes: {
    '/user-guide': ['./private/user-guides/*.pdf'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'www.figma.com',
        pathname: '/api/mcp/asset/**',
      },
      // Private file storage: older API builds still hand out R2 signed links;
      // since 2026-11-07 file links are sealed links to the API (images using
      // them are `unoptimized`, so no host is needed here).
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
  // Apple fetches /.well-known/apple-app-site-association and REQUIRES
  // application/json. The file has no extension (Apple's spec forbids one), so
  // it would otherwise be served as octet-stream and silently rejected — the
  // iOS mirror of the assetlinks content-type trap.
  async headers() {
    return [
      // The reset page may carry a one-time token in its address (emailed link):
      // never send that address to another site, and never keep the page in a
      // cache (2026-11-23).
      {
        source: '/reset-password',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      // Keep the Vercel address (*.vercel.app) out of search results; only
      // 8338logistics.delivery should be indexed. The custom domain never
      // matches this host rule, so it stays indexable.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(?<project>.+)\\.vercel\\.app' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ]
  },
}

module.exports = nextConfig