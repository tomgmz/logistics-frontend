/** @type {import('next').NextConfig} */
const nextConfig = {
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
      // Private file storage: signed, expiring links (see backend lib/storage.ts).
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