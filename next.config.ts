import type { NextConfig } from "next";

const privateWorkspaceHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
];

const legacyWorkspaceSections = ["catalog", "branches", "popups", "schedule", "allocation", "orders", "settings", "products"];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ? ".next-emulator" : ".next",
  output: "standalone",
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
