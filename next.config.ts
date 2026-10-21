import type { NextConfig } from "next";

// Prevent ws from using Webpack-stubbed bufferutil which causes "bufferUtil.mask is not a function"
process.env.WS_NO_BUFFER_UTIL = "true";

const nextConfig: NextConfig = {
  // server.js (custom server + telephony bridge) sets NEXT_DIST_DIR=.next-bridge in
  // dev so its webpack output never collides with `next dev --turbopack` in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "ws",
    "bufferutil",
    "utf-8-validate",
    "@google/genai",
  ],
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("bufferutil", "utf-8-validate", "ws");
      }
    }
    return config;
  },
};

export default nextConfig;
