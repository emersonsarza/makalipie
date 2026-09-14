import Link from "next/link";

import { PiePlate } from "@/components/pie-plate";
import { buttonVariants } from "@/components/ui/button";
import { savoryItems, site, sweetItems } from "@/lib/site";
import { cn } from "@/lib/utils";

const tilts = [-8, 6, -5, 7, -4, 3];

export function MenuCatalog() {
  const savory = savoryItems[0];
  const buko = sweetItems.find((item) => item.slug === "buko");
  const priced = sweetItems.filter((item) => item.image);

  return (
    <div>
      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display max-w-3xl text-5xl leading-none font-extrabold tracking-tight uppercase sm:text-7xl">
            Our menu
          </h1>
          <p className="font-script mt-4 text-4xl text-ink sm:text-5xl">
            {site.slogan}
          </p>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Featuring the classics you love and our weekly special flavors. Fill
            the form, then send it through Instagram.
          </p>
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "default" }),
              "font-display mt-8 h-12 rounded-full px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Fill out the order form
          </Link>
        </div>
      </section>

      {buko ? (
        <section className="border-y-2 border-ink bg-ink px-4 py-10 text-paper sm:px-6">
          <div className="mx-auto max-w-6xl">
            <p className="font-display text-5xl leading-none font-extrabold tracking-tight uppercase">
              {buko.name}
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-paper/85">
              {buko.description}
            </p>
            <p className="font-display mt-4 text-lg font-bold tracking-[0.08em] uppercase">
              {buko.note}
            </p>
          </div>
        </section>
      ) : null}

      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight uppercase sm:text-4xl">
            Sweet tarts &amp; pies
          </h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            {priced.map((item, index) => (
              <div
                key={item.slug}
                className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center"
              >
                <PiePlate
                  item={item}
                  tilt={tilts[index] ?? -6}
                  sizes="(max-width: 640px) 100vw, 14rem"
                  showCopy={false}
                />
                <div>
                  <p className="text-[0.95rem] leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {savory ? (
            <div className="mt-12 border-2 border-ink bg-ink px-6 py-10 text-paper sm:px-10">
              <p className="font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
                {savory.name}
              </p>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-paper/85">
                {savory.description}
              </p>
              {savory.note ? (
                <p className="font-display mt-5 text-lg font-bold tracking-[0.08em] uppercase">
                  {savory.note}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-12 flex flex-col items-start gap-3 border-2 border-ink bg-paper px-6 py-6 text-ink sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed sm:text-base">
              Ready to order? Fill out the form, copy your summary, and send it
              through our Instagram inbox.
            </p>
            <Link
              href="/order"
              className={cn(
                buttonVariants({ variant: "default" }),
                "font-display h-11 shrink-0 rounded-full px-5 font-bold tracking-[0.06em] uppercase"
              )}
            >
              Order now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
