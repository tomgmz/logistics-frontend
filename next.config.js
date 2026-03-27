/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/proxy/:path*',
        destination: 'https://logistics-backend.up.railway.app/api/:path*',
      },
    ]
  },
}

module.exports = nextConfig