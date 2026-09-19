import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { OrderChannelLine } from "@/components/order-channel-line";
import { itemPriceText, savoryItems, site, sweetItems } from "@/lib/site";
import { cn } from "@/lib/utils";

export function MenuCatalog() {
  const savory = savoryItems[0];

  return (
    <div>
      <section className="bg-butter/40 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.2em] text-charcoal/70 uppercase">
            Our menu
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-charcoal sm:text-5xl">
            Your favourite is in here.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-charcoal/80">
            Sweet tarts, weekend Buko pie, and a little something savoury.{" "}
            <span className="font-semibold italic">{site.slogan}</span>
          </p>
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-8 h-12 rounded-full bg-charcoal px-6 text-base font-semibold text-cream hover:bg-charcoal/90",
            )}
          >
            Open order form
          </Link>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Sweet tarts &amp; pies
            </h2>
          </Reveal>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {sweetItems.map((item, index) => (
              <Reveal
                key={item.slug}
                delay={(index % 2) * 50}
                className="grid scroll-mt-32 gap-4 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-start"
              >
                <div className="relative aspect-square overflow-hidden rounded-[1.4rem] bg-butter">
                  <Image
                    src={item.image.src}
                    alt={item.image.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, 11rem"
                    className="object-cover"
                  />
                  {item.bestseller ? (
                    <Badge
                      variant="berry"
                      className="absolute top-3 left-3 shadow-sm"
                    >
                      Bestseller
                    </Badge>
                  ) : null}
                  <span className="absolute right-3 bottom-3 rounded-full bg-cream px-3 py-1 text-sm font-bold text-charcoal shadow-sm ring-1 ring-charcoal/10">
                    {itemPriceText(item)}
                  </span>
                </div>
                <div id={item.slug} className="scroll-mt-32">
                  <h3 className="font-heading text-2xl font-semibold tracking-tight">
                    {item.name}
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-charcoal/75">
                    {item.description}
                  </p>
                  {item.note ? (
                    <p className="mt-3 text-sm font-semibold text-berry">
                      {item.note}
                    </p>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>

          {savory ? (
            <Reveal className="mt-12 overflow-hidden rounded-[2rem] bg-butter ring-1 ring-charcoal/8">
              <div className="grid items-stretch lg:grid-cols-[1.1fr_0.9fr]">
                <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
                  <p className="text-sm font-bold tracking-[0.18em] text-charcoal/70 uppercase">
                    Something savory?
                  </p>
                  <h3
                    id={savory.slug}
                    className="scroll-mt-32 mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
                  >
                    {savory.name}
                  </h3>
                  <p className="mt-4 max-w-md text-lg leading-relaxed text-charcoal/80">
                    {savory.description}
                  </p>
                  <p className="mt-5 text-sm font-semibold text-charcoal">
                    {itemPriceText(savory)}
                    {savory.note ? ` · ${savory.note}` : ""}
                  </p>
                </div>
                <div className="relative min-h-64">
                  <Image
                    src={savory.image.src}
                    alt={savory.image.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                  />
                  <span className="absolute top-4 right-4 rounded-full bg-cream px-3 py-1 text-sm font-bold text-charcoal shadow-sm ring-1 ring-charcoal/10">
                    {itemPriceText(savory)}
                  </span>
                </div>
              </div>
            </Reveal>
          ) : null}

          <Reveal className="mt-12 flex flex-col items-start gap-3 rounded-[1.6rem] bg-charcoal px-6 py-6 text-cream sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed sm:text-base">
              Ready to order? Open the form, copy your summary, and send it
              through our Instagram inbox.
            </p>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <Link
                href="/order"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "h-11 rounded-full px-5 font-semibold",
                )}
              >
                Open order form
              </Link>
              <OrderChannelLine tone="dark" />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
