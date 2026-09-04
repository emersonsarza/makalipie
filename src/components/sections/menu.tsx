import Image from "next/image";

import { InstagramIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { savoryItems, site, sweetItems } from "@/lib/site";
import { cn } from "@/lib/utils";

export function MenuSection() {
  const savory = savoryItems[0];

  return (
    <section id="menu" className="scroll-mt-24 bg-butter/50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
          The menu
        </p>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Sweet classics, small batches, and a Sunday savory.
          </h2>
          <p className="max-w-md text-charcoal/70">
            Display only for now — grab a box at the kiosk, ping us on Instagram,
            or find classic flavors on GrabFood.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sweetItems.map((item) => (
            <Card
              key={item.slug}
              className="gap-0 bg-cream py-0 ring-charcoal/8"
            >
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
              </div>
              <CardHeader className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-heading text-xl">
                    {item.name}
                  </CardTitle>
                  <span className="text-[0.7rem] font-bold tracking-[0.14em] text-charcoal/50 uppercase">
                    Sweet
                  </span>
                </div>
                <CardDescription className="text-[0.95rem] leading-relaxed text-charcoal/70">
                  {item.blurb}
                </CardDescription>
                {item.note ? (
                  <p className="text-sm font-semibold text-berry">{item.note}</p>
                ) : null}
              </CardHeader>
            </Card>
          ))}
        </div>

        {savory ? (
          <div className="mt-8 overflow-hidden rounded-[2rem] bg-crust">
            <div className="grid items-stretch lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
                <p className="text-sm font-bold tracking-[0.18em] text-charcoal/70 uppercase">
                  Something savory?
                </p>
                <h3 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                  {savory.name}
                </h3>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-charcoal/80">
                  {savory.blurb}
                </p>
                <p className="mt-5 text-sm font-semibold text-charcoal">
                  {savory.note}
                </p>
                <a
                  href={site.instagramDmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "mt-6 h-11 w-fit rounded-full bg-charcoal px-5 text-cream hover:bg-charcoal/90"
                  )}
                >
                  <InstagramIcon className="size-4" />
                  Message us for Sundays
                </a>
              </div>
              <div className="relative min-h-64">
                <Image
                  src={savory.image.src}
                  alt={savory.image.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        ) : null}

        <Card className="mt-8 bg-cream ring-charcoal/8">
          <CardContent className="flex flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">
                Seasonal specials &amp; dessert tables
              </CardTitle>
              <CardDescription className="mt-2 max-w-xl text-[0.95rem] text-charcoal/70">
                Small-batch drops, corporate boxes, events, and dessert tables —
                we love a made-just-for-you moment. Tell us the date and the
                craving.
              </CardDescription>
            </div>
            <a
              href={site.instagramDmUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 shrink-0 rounded-full px-5 font-semibold"
              )}
            >
              DM for custom orders
            </a>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
