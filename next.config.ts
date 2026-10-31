import type { NextConfig } from "next";

const privateWorkspaceHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
];

// Redirect only admin sections that have not yet moved to v2.
const legacyWorkspaceSections = ["products"];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ? ".next-emulator" : ".next",
  // Docker copies .next/standalone. Vercel’s build step expects the default trace file instead.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  poweredByHeader: false,
  async redirects() {
    return legacyWorkspaceSections.map((section) => ({
      source: `/admin/${section}/:path*`,
      destination: `/v1/${section}/:path*`,
      permanent: false,
    }));
  },
  async headers() {
    return [
      { source: "/admin/:path*", headers: privateWorkspaceHeaders },
      { source: "/v1/:path*", headers: privateWorkspaceHeaders },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
