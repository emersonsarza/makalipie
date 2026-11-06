export type SiteTheme = "christmas" | "original";

export function resolveSiteTheme(value: string | null): SiteTheme {
  return value === "original" ? "original" : "christmas";
}

export function isCustomerPath(pathname: string): boolean {
  return !/^\/(admin|v1|api)(\/|$)/.test(pathname);
}

/** Merge only the theme; destination filters and fragments remain intact. */
export function themedHref(href: string, theme: SiteTheme): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://makalipie.invalid");
  if (!isCustomerPath(url.pathname)) return href;
  if (!url.searchParams.has("theme")) url.searchParams.set("theme", theme);
  return `${url.pathname}${url.search}${url.hash}`;
}

const christmasIcon = "/brand/seal-christmas.png";
const christmasAppleIcon = "/brand/seal-christmas-apple.png";

/** Point the tab icon at the Christmas seal, or back at the generated pie icon. */
export function syncThemeIcons(theme: SiteTheme) {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="apple-touch-icon"]')) {
    if (!link.dataset.originalHref) link.dataset.originalHref = link.getAttribute("href") || "";
    const apple = link.rel.includes("apple");
    const href = theme === "christmas" ? (apple ? christmasAppleIcon : christmasIcon) : link.dataset.originalHref || (apple ? "/apple-icon" : "/icon");
    if (link.dataset.themeIcon === href) continue;
    link.dataset.themeIcon = href;
    link.href = href;
  }
}

// Runs in the document head before content paints, independently of hydration.
export const themeBootstrap = `(()=>{const p=location.pathname;const t=/^\\/(admin|v1|api)(\\/|$)/.test(p)?'original':new URLSearchParams(location.search).get('theme')==='original'?'original':'christmas';document.documentElement.dataset.siteTheme=t;const apply=()=>{if(typeof document.querySelectorAll!=='function')return;for(const l of document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')){if(!l.dataset.originalHref)l.dataset.originalHref=l.getAttribute('href')||'';const apple=l.rel.indexOf('apple')>=0;const h=t==='christmas'?(apple?'${christmasAppleIcon}':'${christmasIcon}'):(l.dataset.originalHref||(apple?'/apple-icon':'/icon'));if(l.dataset.themeIcon===h)continue;l.dataset.themeIcon=h;l.href=h}};apply();if(typeof MutationObserver==='function'&&document.head)new MutationObserver(apply).observe(document.head,{childList:true,subtree:true})})()`;
