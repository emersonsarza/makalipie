import type { Metadata } from "next";
import { resolveSiteTheme, type SiteTheme } from "@/lib/site-theme";
import { site } from "@/lib/site";

export type SocialPage = "home" | "menu" | "order";
export type SocialSearchParams = Record<string, string | string[] | undefined>;

const descriptions: Record<SocialPage, string> = {
  home: "Makalipie — A little pie. A lot of happy. Handcrafted tarts and pies in Cebu.",
  menu: "Makalipie menu — Sweet tarts, Buko weekends and savoury pies.",
  order: "Order Makalipie — Put together a box of handcrafted pies and confirm on Instagram.",
};

export function socialImageMetadata(page: SocialPage, theme: SiteTheme = "christmas") {
  const path = page === "home" ? "" : `/${page}`;
  return {
    url: `${path}/opengraph-image?theme=${theme}&v=christmas-2026-2`,
    type: "image/png",
    width: 1200,
    height: 630,
    alt: `${descriptions[page]}${theme === "christmas" ? " Christmas edition." : ""}`,
  };
}

export async function themedMetadata(base: Metadata, page: SocialPage, searchParams: Promise<SocialSearchParams>, publishedTheme?: SiteTheme): Promise<Metadata> {
  const params = await searchParams;
  const value = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const theme = publishedTheme ?? resolveSiteTheme(value ?? null);
  const image = socialImageMetadata(page, theme);
  const title = typeof base.title === "string" ? `${base.title} · Makalipie` : "Makalipie | Handcrafted Tarts & Pies in Cebu";
  const description = base.description ?? site.description;
  const canonical = base.alternates?.canonical;
  const url = typeof canonical === "string" || canonical instanceof URL ? canonical : page === "home" ? "/" : `/${page}`;
  const identity = new URL(base.openGraph?.url ?? url, "https://preview.invalid");
  identity.search = "";
  if (!publishedTheme) identity.searchParams.set("theme", theme);
  if (page === "menu" && params.view === "preorders") identity.searchParams.set("view", "preorders");
  const shareUrl = `${identity.pathname}${identity.search}`;
  return {
    ...base,
    openGraph: { type: "website", locale: "en_PH", siteName: site.name, title, description, ...base.openGraph, url: shareUrl, images: [image] },
    twitter: { card: "summary_large_image", title, description, ...base.twitter, images: [image] },
  };
}
