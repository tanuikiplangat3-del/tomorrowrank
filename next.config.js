/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // App is served under tools.welcometomorrow.io/ranktomorrow
  basePath: "/ranktomorrow",
  // NOTE: no `output` here. The OpenNext Cloudflare adapter builds its own
  // worker bundle from the default .next output; "standalone" breaks it.
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};
module.exports = nextConfig;
