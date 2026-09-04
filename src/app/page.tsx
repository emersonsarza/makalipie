import { HowToOrderSection } from "@/components/sections/how-to-order";
import { Hero } from "@/components/sections/hero";
import { MenuSection } from "@/components/sections/menu";
import { ReviewsSection } from "@/components/sections/reviews";
import { StorySection } from "@/components/sections/story";
import { VisitSection } from "@/components/sections/visit";
import { SiteShell } from "@/components/site-shell";

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <MenuSection />
      <StorySection />
      <ReviewsSection />
      <VisitSection />
      <HowToOrderSection />
    </SiteShell>
  );
}
