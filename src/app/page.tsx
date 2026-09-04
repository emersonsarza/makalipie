import { HowToOrderSection } from "@/components/sections/how-to-order";
import { Hero } from "@/components/sections/hero";
import { MenuSection } from "@/components/sections/menu";
import { StorySection } from "@/components/sections/story";
import { VisitSection } from "@/components/sections/visit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <div id="top" className="flex min-h-full flex-1 flex-col">
      <div className="bg-charcoal px-4 py-2 text-center text-sm text-cream">
        <p>
          Buko pie (bestseller) · Fri–Sun ·{" "}
          <a
            href={site.instagramDmUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-crust underline decoration-crust/70 underline-offset-2"
          >
            message us to order
          </a>
        </p>
      </div>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <MenuSection />
        <StorySection />
        <VisitSection />
        <HowToOrderSection />
      </main>
      <SiteFooter />
    </div>
  );
}
