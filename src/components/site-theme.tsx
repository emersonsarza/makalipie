"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useSyncExternalStore, type ComponentProps } from "react";
import { isCustomerPath, resolveSiteTheme, syncThemeIcons, themedHref, type SiteTheme } from "@/lib/site-theme";

const themeEvent = "makalipie:theme";
function subscribe(listener: () => void) {
  window.addEventListener(themeEvent, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener("popstate", listener);
  };
}
function snapshot(): SiteTheme {
  return resolveSiteTheme(new URLSearchParams(window.location.search).get("theme"));
}
function serverSnapshot(): SiteTheme { return "christmas"; }
export function useSiteTheme() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }

function applyTheme(theme: SiteTheme) {
  const resolved = isCustomerPath(location.pathname) ? theme : "original";
  document.documentElement.dataset.siteTheme = resolved;
  syncThemeIcons(resolved);
  window.dispatchEvent(new Event(themeEvent));
}

function ThemeSync() {
  const pathname = usePathname();
  const params = useSearchParams();
  useLayoutEffect(() => { applyTheme(resolveSiteTheme(params.get("theme"))); }, [pathname, params]);
  return null;
}

export function SiteThemeController() {
  return <Suspense fallback={null}><ThemeSync /></Suspense>;
}

/** A customer link that also works in menus, filters and new tabs. */
export function ThemeLink({ href, ...props }: ComponentProps<typeof Link>) {
  const theme = useSiteTheme();
  const destination = typeof href === "string" ? themedHref(href, theme) : href;
  return <Link {...props} href={destination} />;
}

export function ThemeSwitch() {
  const theme = useSiteTheme();
  function select(next: SiteTheme) {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    applyTheme(next);
  }
  return <div className="theme-switch" role="group" aria-label="Theme">
    <span className="theme-switch-label">Theme</span>
    <div className="theme-switch-options">
      <button type="button" aria-pressed={theme === "christmas"} onClick={() => select("christmas")}>Christmas</button>
      <button type="button" aria-pressed={theme === "original"} onClick={() => select("original")}>Original</button>
    </div>
  </div>;
}
