/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// Hosts allowed to reach the dev server from a browser (live preview, tunnels, reverse proxies).
// Add your own hostname here when deploying behind a custom domain in development mode.
const devOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? '*.e2b.app,localhost,127.0.0.1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pdfkit', 'exceljs', 'svg-to-pdfkit'],
  allowedDevOrigins: isDev ? devOrigins : [],
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
      allowedOrigins: isDev ? devOrigins : [],
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Never cache private application data or generated documents.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
