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
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
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
    ]
  },
}

module.exports = nextConfig