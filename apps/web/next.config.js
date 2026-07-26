/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@opshub/contracts"],
  // Standalone output is what lets the Docker runtime stage skip installing
  // dependencies, but producing it requires creating symlinks — which fails
  // with EPERM on Windows unless Developer Mode is on. It is therefore opt-in:
  // the Dockerfile sets this, local builds on any OS keep working without it.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" ? { output: "standalone" } : {}),
};

module.exports = nextConfig;
