"use client";
import { usePublicShop } from "@/components/public-shop-provider";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({
  children,
  showBanner = true,
  menuView,
}: {
  children: React.ReactNode;
  showBanner?: boolean;
  menuView?: "menu" | "preorders";
}) {
  const shop = usePublicShop();
  return (
    <div id="top" className="flex min-h-full flex-1 flex-col">
      {showBanner && (
        <div className="announcement">
          A little weekend tradition. Buko pie, Friday to Sunday.
          <a href={shop.links.instagramDm} target="_blank" rel="noreferrer">
            Save me a pie <ArrowUpRight size={14} aria-hidden />
          </a>
        </div>
      )}
      <SiteHeader menuView={menuView} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
