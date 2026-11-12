"use client";
import { usePublicShop } from "@/components/public-shop-provider";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { ThemeLink } from "@/components/site-theme";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({
  children,
  className,
  showBanner = true,
  showFooterCta = true,
  mobileCheckout = false,
  menuView,
}: {
  children: React.ReactNode;
  className?: string;
  showBanner?: boolean;
  showFooterCta?: boolean;
  mobileCheckout?: boolean;
  menuView?: "menu" | "preorders";
}) {
  const shop = usePublicShop();
  const help = shop.links.instagramDm || shop.links.messenger || shop.links.instagram;
  return (
    <div id="top" className={`site-shell flex min-h-full flex-1 flex-col ${mobileCheckout ? "site-shell-checkout" : ""} ${className ?? ""}`}>
      {showBanner && (
        <div className="announcement">
          A little weekend tradition. Buko pie, Friday to Sunday.
          {shop.links.instagramDm && <a href={shop.links.instagramDm} target="_blank" rel="noreferrer">
            Save me a pie <ArrowUpRight size={14} aria-hidden />
          </a>}
        </div>
      )}
      <SiteHeader menuView={menuView} />
      <main id="main" className="flex-1">
        {children}
      </main>
      {mobileCheckout ? <>
        <div className="checkout-storefront-footer"><SiteFooter showCta={showFooterCta} /></div>
        <footer className="checkout-mobile-footer">
          <nav aria-label="Checkout help">
            {help ? <a href={help} target="_blank" rel="noreferrer">Help</a> : <ThemeLink href="/#visit">Help</ThemeLink>}
            <ThemeLink href="/terms">Terms</ThemeLink>
            <ThemeLink href="/privacy">Privacy</ThemeLink>
          </nav>
        </footer>
      </> : <SiteFooter showCta={showFooterCta} />}
    </div>
  );
}
