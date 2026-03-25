import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a fresh output directory so Turbopack doesn't try to acquire a
  // lockfile on the root-owned .next/dev/cache from a prior container run.
  distDir: ".next-build",
  // Allow the reverse-proxy hostname to reach dev-server infrastructure
  // (HMR, dev overlay, etc.). Without this, Next.js 16 blocks cross-origin
  // requests from origins other than localhost, preventing React from fully
  // hydrating behind a reverse proxy in dev mode.
  allowedDevOrigins: ["actual-admin-panel-dev.nafverse.com"],
};

export default nextConfig;