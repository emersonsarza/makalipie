import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// Update these dates only when page content or structured data meaningfully changes.
const pages = [
  { path: "/", updated: "2026-09-19" },
  { path: "/menu", updated: "2026-09-19" },
  { path: "/order", updated: "2026-09-19" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, updated }) => ({
    url: new URL(path, getSiteUrl()).href,
    lastModified: updated,
  }));
}
