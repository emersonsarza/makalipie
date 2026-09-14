import Image from "next/image";

import { storyImages } from "@/lib/site";

export function StorySection() {
  return (
    <section id="story" className="scroll-mt-24 border-t-2 border-ink/20 py-14 sm:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="relative col-span-2 aspect-[16/8] overflow-hidden bg-ink">
            <Image
              src={storyImages.counter.src}
              alt={storyImages.counter.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 48vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-square overflow-hidden bg-ink">
            <Image
              src={storyImages.pecan.src}
              alt={storyImages.pecan.alt}
              fill
              sizes="(max-width: 1024px) 50vw, 22vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-between bg-ink p-5 text-paper">
            <p className="font-display text-3xl leading-none font-extrabold tracking-tight uppercase">
              One crust. A whole personality.
            </p>
            <p className="font-display text-sm font-bold tracking-[0.14em] uppercase">
              Handmade in Cebu
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Baked like someone at home was waiting for you.
          </h2>
          <div className="mt-6 space-y-4 text-[1.05rem] leading-relaxed text-ink-soft">
            <p>
              Makalipie began in 2020 with a simple craving: tarts and pies that
              taste like a hug from the kitchen — proudly Cebuana-made, never
              factory-flat.
            </p>
            <p>
              The thing people DM us about? The crust. We roll it by hand, bake
              it till it shatters just so, and fill it with the flavors Cebu
              keeps coming back for: Keylime, Pecan, S&apos;mores, Banoffee,
              Oreo, and our bestseller Buko.
            </p>
            <p>
              Some days it&apos;s a quiet kiosk slice at Streetscape. Sundays,
              it&apos;s Butter Chicken Curry pie at the market. Always,
              it&apos;s made with a little extra heart.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
