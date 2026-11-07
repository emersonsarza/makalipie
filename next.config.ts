import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker copies .next/standalone. Vercel’s build step expects the default trace file instead.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  poweredByHeader: false,
};

export default nextConfig;
