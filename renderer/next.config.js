/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  assetPrefix: './',
  trailingSlash: true,
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
