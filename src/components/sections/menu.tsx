import Link from "next/link";

import { PiePlate } from "@/components/pie-plate";
import { buttonVariants } from "@/components/ui/button";
import { menuItems, site } from "@/lib/site";
import { cn } from "@/lib/utils";

const tilts = [-7, 6, -4, 8, -5, 3, -6];

export function MenuSection() {
  const buko = menuItems.find((item) => item.slug === "buko");
  const sweets = menuItems.filter(
    (item) => item.kind === "sweet" && item.slug !== "buko" && item.image
  );

  return (
    <section id="menu" className="scroll-mt-24 border-t-2 border-ink/20 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="font-display text-5xl leading-none font-extrabold tracking-tight uppercase sm:text-7xl">
          Our menu
        </h2>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">
          {site.slogan} Classics you can order any day, plus the windows you
          cannot miss.
        </p>

        {buko ? (
          <div className="mt-8 border-2 border-ink bg-ink px-5 py-6 text-paper sm:px-8">
            <p className="font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
              {buko.name}
            </p>
            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-paper/85">
              {buko.description}
            </p>
            <p className="font-display mt-4 text-lg font-bold tracking-[0.08em] uppercase">
              {buko.note}
            </p>
          </div>
        ) : null}

        <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {sweets.map((item, index) => (
            <PiePlate key={item.slug} item={item} tilt={tilts[index] ?? -6} />
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/menu"
            className={cn(
              buttonVariants({ variant: "default" }),
              "font-display h-12 rounded-full px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Full menu &amp; prices
          </Link>
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "font-display h-12 rounded-full border-2 border-ink px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Order now
          </Link>
        </div>
      </div>
    </section>
  );
}
