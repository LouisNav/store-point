/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3', 'mongoose', 'bcryptjs'],
  // Next.js 16 uses Turbopack by default. Empty config silences the warning.
  turbopack: {},
  // Allow server actions from configured origins (ALLOWED_ORIGINS env var, comma-separated)
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS || 'localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    },
  },
};

export default nextConfig;
