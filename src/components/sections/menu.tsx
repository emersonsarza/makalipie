import Image from "next/image";
import Link from "next/link";

import { OrderChannelLine } from "@/components/order-channel-line";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  featuredMenuSlugs,
  itemPriceText,
  menuItems,
} from "@/lib/site";
import { cn } from "@/lib/utils";

export function MenuSection() {
  const featured = featuredMenuSlugs
    .map((slug) => menuItems.find((item) => item.slug === slug))
    .filter(Boolean);
  const [primary, ...secondary] = featured;

  return (
    <section id="menu" className="scroll-mt-24 bg-butter/50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Classics and weekly specials.
          </h2>
          <p className="mt-3 max-w-lg text-charcoal/70">
            A peek at what we bake. See prices, then send your order through
            Instagram.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
          {primary ? (
            <Reveal className="group/card relative overflow-hidden rounded-[1.75rem] bg-cream ring-1 ring-charcoal/8">
              <div className="relative aspect-[5/4] overflow-hidden sm:aspect-[16/11] lg:aspect-auto lg:min-h-[26rem]">
                <Image
                  src={primary.image.src}
                  alt={primary.image.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="menu-card-image object-cover"
                />
                {primary.bestseller ? (
                  <Badge
                    variant="berry"
                    className="bestseller-pulse absolute top-4 left-4 shadow-sm"
                  >
                    Bestseller
                  </Badge>
                ) : null}
                <span className="absolute top-4 right-4 rounded-full bg-cream px-3 py-1 text-sm font-bold text-charcoal shadow-sm ring-1 ring-charcoal/10">
                  {itemPriceText(primary)}
                </span>
              </div>
              <div className="space-y-2 p-5 sm:p-6">
                <h3 className="font-heading text-2xl font-semibold tracking-tight">
                  {primary.name}
                </h3>
                <p className="max-w-md text-[0.95rem] leading-relaxed text-charcoal/70">
                  {primary.blurb}
                </p>
                {primary.note ? (
                  <p className="text-sm font-semibold text-charcoal/55">
                    {primary.note}
                  </p>
                ) : null}
              </div>
            </Reveal>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {secondary.map((item, index) =>
              item ? (
                <Reveal
                  key={item.slug}
                  delay={(index + 1) * 50}
                  className="group/card overflow-hidden rounded-[1.6rem] bg-cream ring-1 ring-charcoal/8 sm:flex sm:flex-col lg:grid lg:grid-cols-[0.95fr_1.05fr]"
                >
                  <div className="relative aspect-[5/4] overflow-hidden lg:aspect-auto lg:min-h-[11.5rem]">
                    <Image
                      src={item.image.src}
                      alt={item.image.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 22vw"
                      className="menu-card-image object-cover"
                    />
                    <span className="absolute top-3 right-3 rounded-full bg-cream px-3 py-1 text-sm font-bold text-charcoal shadow-sm ring-1 ring-charcoal/10">
                      {itemPriceText(item)}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-1.5 p-4 sm:p-5">
                    <h3 className="font-heading text-xl font-semibold tracking-tight">
                      {item.name}
                    </h3>
                    <p className="text-[0.95rem] leading-relaxed text-charcoal/70">
                      {item.blurb}
                    </p>
                  </div>
                </Reveal>
              ) : null
            )}
          </div>
        </div>

        <Reveal className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href="/menu"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-12 rounded-full px-6 text-base font-semibold"
            )}
          >
            See the menu
          </Link>
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-12 rounded-full border-charcoal/15 bg-cream px-6 text-base font-semibold"
            )}
          >
            Open order form
          </Link>
          <OrderChannelLine className="sm:ml-2" />
        </Reveal>
      </div>
    </section>
  );
}
