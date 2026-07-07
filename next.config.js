/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // App is served under tools.welcometomorrow.io/ranktomorrow
  basePath: "/ranktomorrow",
  // Produce a self-contained server build for a small Docker image
  output: "standalone",
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};
module.exports = nextConfig;
