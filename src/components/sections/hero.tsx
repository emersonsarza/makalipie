import { HoursThreshold } from "@/components/hours-threshold";
import { PiePlate } from "@/components/pie-plate";
import { buttonVariants } from "@/components/ui/button";
import { featuredMenuSlugs, menuItems, site } from "@/lib/site";
import { cn } from "@/lib/utils";

const tilts = [-8, 5, -4];

export function Hero() {
  const featured = featuredMenuSlugs
    .map((slug) => menuItems.find((item) => item.slug === slug))
    .filter(Boolean);

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <p className="font-display text-sm font-bold tracking-[0.18em] text-ink uppercase">
          Tarts &amp; pies · Cebu · EST. {site.established}
        </p>
        <h1 className="font-script mt-3 max-w-4xl text-[clamp(2.6rem,8vw,5rem)] leading-[0.92] text-ink">
          Makalipie
          <br />
          gyud ni!
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
          Proudly Cebuana-made, with a one-of-a-kind handcrafted crust. See
          what&apos;s baking, then send the order through Instagram — we&apos;ll
          confirm from there.
        </p>
      </div>

      <HoursThreshold className="mx-auto mt-8 max-w-6xl" />

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:grid-cols-3 sm:py-12">
        {featured.map((item, index) =>
          item ? (
            <PiePlate
              key={item.slug}
              item={item}
              tilt={tilts[index] ?? -6}
              priority={index === 0}
              sizes="(max-width: 640px) 90vw, 30vw"
            />
          ) : null
        )}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-12 sm:flex-row sm:items-center sm:px-6">
        <a
          href="/order"
          className={cn(
            buttonVariants({ variant: "default" }),
            "font-display h-12 rounded-full px-6 text-base font-bold tracking-[0.06em] uppercase"
          )}
        >
          Send an Instagram order
        </a>
        <a
          href="/menu"
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "font-display h-12 rounded-full border-2 border-ink px-6 text-base font-bold tracking-[0.06em] uppercase"
          )}
        >
          See the menu
        </a>
        <p className="text-sm font-bold text-ink-soft sm:ml-2">
          Classic flavors also on GrabFood.
        </p>
      </div>
    </section>
  );
}
