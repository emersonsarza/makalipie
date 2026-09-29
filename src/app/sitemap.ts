import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// Update these dates only when page content or structured data meaningfully changes.
const pages = [
  { path: "/", updated: "2026-09-19" },
  { path: "/menu", updated: "2026-09-19" },
  { path: "/order", updated: "2026-09-29" },
  { path: "/order/preorder", updated: "2026-09-29" },
  { path: "/terms", updated: "2026-09-30" },
  { path: "/privacy", updated: "2026-09-30" },
  { path: "/refund", updated: "2026-09-30" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, updated }) => ({
    url: new URL(path, getSiteUrl()).href,
    lastModified: updated,
  }));
}
