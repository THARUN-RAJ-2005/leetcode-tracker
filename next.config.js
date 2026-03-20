/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for SSE streaming on Vercel
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
