/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@opshub/contracts"],
};

module.exports = nextConfig;
