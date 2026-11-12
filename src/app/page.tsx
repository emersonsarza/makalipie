import { themedMetadata, type SocialSearchParams } from "@/lib/social-metadata";
import { manilaDate } from "@/lib/catalog/rules";
import { HomeContent } from "@/components/sections/home-content";
import { SiteShell } from "@/components/site-shell";
import { staticPublicMenu, staticPublicShop } from "@/lib/public/static-shop";
import { readPublishedShop, readUpcomingDrops, storefrontRenderTime } from "@/lib/public/published-shop";
import { menuFromShop, publicShopView } from "@/lib/public/storefront-view";
import { getSiteUrl, site } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SocialSearchParams> }) {
  const published = await readPublishedShop();
  return themedMetadata({ openGraph: { url: "/" } }, "home", searchParams, published?.theme);
}

export default async function Home() {
  const [published, drops] = await Promise.all([readPublishedShop(), readUpcomingDrops()]);
  const shop = published ? publicShopView(published) : staticPublicShop();
  const { items } = published ? menuFromShop(published) : staticPublicMenu();
  return (
    <SiteShell className="home-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${getSiteUrl()}/#website`,
            name: site.name,
            url: `${getSiteUrl()}/`,
            inLanguage: "en-PH",
            publisher: { "@id": `${getSiteUrl()}/#bakery` },
          }).replace(/</g, "\\u003c"),
        }}
      />
      <HomeContent shop={shop} items={items} drops={drops} today={published?.today ?? manilaDate(storefrontRenderTime())} />
    </SiteShell>
  );
}
