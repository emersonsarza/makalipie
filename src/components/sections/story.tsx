import Image from "next/image";

import { Reveal } from "@/components/reveal";
import { storyImages } from "@/lib/site";

export function StorySection() {
  return (
    <section id="story" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="grid grid-cols-2 gap-3">
          <div className="relative col-span-2 aspect-[16/10] overflow-hidden rounded-[1.6rem]">
            <Image
              src={storyImages.kitchen.src}
              alt={storyImages.kitchen.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 48vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-square overflow-hidden rounded-[1.4rem]">
            <Image
              src={storyImages.bakery.src}
              alt={storyImages.bakery.alt}
              fill
              sizes="(max-width: 1024px) 50vw, 22vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-between rounded-[1.4rem] bg-butter p-5">
            <p className="font-heading text-2xl leading-tight">
              One crust. A whole personality.
            </p>
            <p className="text-sm font-semibold tracking-wide text-charcoal/60 uppercase">
              Handmade in Cebu
            </p>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Baked like someone at home was waiting for you.
          </h2>
          <div className="mt-6 space-y-4 text-[1.05rem] leading-relaxed text-charcoal/75">
            <p>
              Makalipie began in 2020 with a simple craving: tarts and pies that
              taste like a hug from the kitchen. Proudly Cebuana-made, never
              factory-flat. The crust is what people DM us about. We roll it by
              hand, bake it till it shatters just so, and fill it with the
              flavors Cebu keeps coming back for.
            </p>
            <p>
              Some days it&apos;s a quiet kiosk slice at Streetscape. Sundays,
              it&apos;s Butter Chicken Curry pie at the market. Always, it&apos;s
              made with a little extra heart.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
