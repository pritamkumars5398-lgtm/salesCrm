import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // server.js (custom server + telephony bridge) sets NEXT_DIST_DIR=.next-bridge in
  // dev so its webpack output never collides with `next dev --turbopack` in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
};

export default nextConfig;
