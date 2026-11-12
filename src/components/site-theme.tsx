"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useLayoutEffect, type ComponentProps, type ReactNode } from "react";
import { isCustomerPath, syncThemeIcons, type SiteTheme } from "@/lib/site-theme";

const ThemeContext = createContext<{ theme: SiteTheme; preview?: boolean }>({ theme: "christmas" });
export function useSiteTheme() { return useContext(ThemeContext).theme; }

function applyTheme(theme: SiteTheme) {
  document.documentElement.dataset.siteTheme = theme;
  syncThemeIcons(theme);
}

export function SiteThemeController({ theme, children }: { theme: SiteTheme; children: ReactNode }) {
  const pathname = usePathname();
  useLayoutEffect(() => {
    if (pathname !== "/admin/storefront/preview") applyTheme(isCustomerPath(pathname) ? theme : "original");
  }, [pathname, theme]);
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function PreviewTheme({ theme, children }: { theme: SiteTheme; children: ReactNode }) {
  useLayoutEffect(() => {
    applyTheme(theme);
    return () => applyTheme("original");
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, preview: true }}>{children}</ThemeContext.Provider>;
}

export function ThemeLink({ href, ...props }: ComponentProps<typeof Link>) {
  const { theme, preview } = useContext(ThemeContext);
  if (!preview) return <Link {...props} href={href} />;
  if (typeof href !== "string") return <span className={props.className}>{props.children}</span>;
  const url = new URL(href, "https://makalipie.invalid");
  if (url.origin !== "https://makalipie.invalid" || !["/", "/menu"].includes(url.pathname)) {
    return <span className={props.className} aria-disabled="true">{props.children}</span>;
  }
  const params = new URLSearchParams({ theme });
  if (url.pathname === "/menu") params.set("section", "menu");
  if (url.searchParams.get("view") === "preorders") params.set("view", "preorders");
  return <Link {...props} href={`/admin/storefront/preview?${params}${url.hash}`} />;
}
