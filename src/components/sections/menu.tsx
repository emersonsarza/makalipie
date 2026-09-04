import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  featuredMenuSlugs,
  formatPrice,
  menuItems,
  site,
} from "@/lib/site";
import { cn } from "@/lib/utils";

export function MenuSection() {
  const featured = featuredMenuSlugs
    .map((slug) => menuItems.find((item) => item.slug === slug))
    .filter(Boolean);

  return (
    <section id="menu" className="scroll-mt-24 bg-butter/50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
            The menu
          </p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Featuring the classics you love and our weekly special flavors.
            </h2>
            <p className="max-w-md text-charcoal/70">
              A peek at what we bake. See the full list with prices, then send
              your order through Instagram.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item, index) =>
            item ? (
              <Reveal key={item.slug} delay={index * 50}>
                <Card className="gap-0 bg-cream py-0 ring-charcoal/8">
                  <div className="relative aspect-[5/4] overflow-hidden">
                    <Image
                      src={item.image.src}
                      alt={item.image.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition duration-500 group-hover/card:scale-[1.03]"
                    />
                    {item.bestseller ? (
                      <Badge
                        variant="berry"
                        className="absolute top-3 left-3 shadow-sm"
                      >
                        Bestseller
                      </Badge>
                    ) : null}
                    {item.price != null ? (
                      <span className="absolute top-3 right-3 rounded-full bg-cream px-3 py-1 text-sm font-bold text-charcoal shadow-sm ring-1 ring-charcoal/10">
                        {formatPrice(item.price)}
                      </span>
                    ) : null}
                  </div>
                  <CardHeader className="pt-4 pb-4">
                    <CardTitle className="font-heading text-xl">
                      {item.name}
                    </CardTitle>
                    <CardDescription className="text-[0.95rem] leading-relaxed text-charcoal/70">
                      {item.blurb}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Reveal>
            ) : null
          )}
        </div>

        <Reveal className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href="/menu"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-12 rounded-full px-6 text-base font-semibold"
            )}
          >
            See the full menu
          </Link>
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-12 rounded-full border-charcoal/15 bg-cream px-6 text-base font-semibold"
            )}
          >
            Order now
          </Link>
          <p className="text-sm text-charcoal/60 sm:ml-2">
            {site.slogan}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
