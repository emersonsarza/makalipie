"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HomeContent } from "@/components/sections/home-content";
import { MenuCatalog } from "@/components/sections/menu-catalog";
import { PreviewTheme } from "@/components/site-theme";
import { PublicShopProvider } from "@/components/public-shop-provider";
import { menuFromShop, publicShopView, type PublishedShop } from "@/lib/public/storefront-view";
import type { ThemeName } from "@/lib/storefront/types";
import { adminRequest, OrderRequestError } from "../orders-data";

export function StorefrontPreview({ theme, section, preorder }: { theme: ThemeName; section: "home" | "menu"; preorder: boolean }) {
  const [shop, setShop] = useState<PublishedShop>();
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    void adminRequest<PublishedShop>(`/api/admin/preview?theme=${theme}`, { signal: request.signal }).then(result => {
      if (!request.signal.aborted) { setShop(result); setError(""); }
    }).catch(failure => {
      if (!request.signal.aborted) setError(failure instanceof OrderRequestError && failure.status === 401
        ? "Sign in as an owner to open this preview." : "Could not load the storefront preview.");
    });
    return () => request.abort();
  }, [theme]);

  const ready = shop?.theme === theme;
  useEffect(() => {
    if (ready && section === "home" && window.location.hash === "#visit") {
      document.getElementById("visit")?.scrollIntoView();
    }
  }, [ready, section]);

  if (error) return <main className="mx-auto max-w-xl space-y-4 p-6">
    <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
    <Link href="/admin/storefront" className="underline">Back to Storefront</Link>
  </main>;
  if (!shop || shop.theme !== theme) return <p role="status" className="p-6">Loading storefront preview…</p>;

  const view = publicShopView(shop);
  const { items, sections } = menuFromShop(shop);
  return <PreviewTheme theme={theme}><PublicShopProvider value={view}>
    <div className={section === "home" ? "site-shell home-page" : "site-shell"}>
      <header className="border-b bg-background p-4">
        <div className="wrap space-y-2">
          <p className="text-sm font-semibold">Previewing {theme === "christmas" ? "Christmas" : "Original"} · Unpublished preview</p>
          <p className="text-sm">Only signed-in owners can see this preview. Ordering is disabled.</p>
          <nav aria-label="Preview pages" className="flex flex-wrap gap-4 text-sm">
            {([["home", "Home"], ["menu", "Menu"]] as const).map(([id, label]) =>
              <Link key={id} href={`/admin/storefront/preview?theme=${theme}&section=${id}`} aria-current={section === id ? "page" : undefined} className="underline aria-[current=page]:font-bold">{label}</Link>)}
            <Link href={`/admin/storefront/preview?theme=${theme}&section=home#visit`} className="underline">Find Us</Link>
          </nav>
        </div>
      </header>
      <main>
        {section === "home" && <HomeContent shop={view} items={items} today={shop.today} preview />}
        {section === "menu" && <MenuCatalog items={items} sections={sections} preorder={preorder} />}
      </main>
    </div>
  </PublicShopProvider></PreviewTheme>;
}
