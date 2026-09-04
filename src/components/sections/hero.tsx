import { ArrowRight } from "lucide-react";
import Image from "next/image";

import { InstagramIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { site, storyImages } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div className="order-2 lg:order-1">
          <p className="inline-flex items-center gap-2 rounded-full bg-butter px-3 py-1 text-xs font-bold tracking-[0.16em] text-charcoal uppercase">
            Proudly Cebuana-made · EST. {site.established}
          </p>
          <h1 className="mt-5 max-w-xl text-[2.35rem] leading-[1.05] font-semibold tracking-tight text-charcoal sm:text-5xl lg:text-[3.4rem]">
            {site.tagline}
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-charcoal/75">
            Tarts &amp; pies with a one-of-a-kind handcrafted crust. Come hungry
            to Streetscape, Banilad — or slide into our DMs. We&apos;ll save you
            a slice.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#menu"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-12 rounded-full px-6 text-base font-semibold"
              )}
            >
              See the menu
              <ArrowRight className="size-4" />
            </a>
            <a
              href={site.instagramDmUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 rounded-full border-charcoal/15 bg-cream px-6 text-base font-semibold"
              )}
            >
              <InstagramIcon className="size-4" />
              Order via Instagram
            </a>
          </div>
          <p className="mt-4 text-sm text-charcoal/60">
            Classic flavors also on{" "}
            <a
              href={site.grabFoodUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-charcoal underline decoration-crust decoration-2 underline-offset-4"
            >
              GrabFood
            </a>
            . Online pre-order is on the way.
          </p>
        </div>

        <div className="relative order-1 mx-auto w-full max-w-md lg:order-2 lg:max-w-none">
          <div className="absolute -top-4 -left-3 z-10 size-20 sm:size-24 lg:-left-6">
            <LogoMark className="size-full drop-shadow-md" />
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-charcoal/8 bg-butter shadow-[0_24px_60px_-28px_rgb(44_42_40_/_45%)]">
            <div className="relative aspect-[4/5] sm:aspect-[5/6]">
              <Image
                src={storyImages.crust.src}
                alt={storyImages.crust.alt}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 42vw"
                className="object-cover"
              />
            </div>
          </div>
          <p className="absolute right-3 -bottom-4 max-w-[11rem] rounded-2xl bg-charcoal px-4 py-3 text-sm leading-snug font-medium text-cream shadow-lg sm:right-6">
            Handcrafted crust. Sweet &amp; savoury. Made in Cebu.
          </p>
        </div>
      </div>
    </section>
  );
}
