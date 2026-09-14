import { HoursThreshold } from "@/components/hours-threshold";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function VisitSection() {
  return (
    <section id="visit" className="scroll-mt-24 border-t-2 border-ink/20 py-14 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Pie heaven on the 2nd floor.
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            Find us at Streetscape, Banilad — the kiosk is open every day, and
            Sundays have a savory plot twist.
          </p>

          <div className="mt-8 space-y-3">
            <div className="border-2 border-ink bg-paper px-5 py-5 text-ink">
              <p className="font-display text-2xl leading-none font-extrabold tracking-tight uppercase">
                {site.kiosk.name}
              </p>
              <p className="mt-3 text-ink-soft">
                {site.kiosk.floor}, {site.kiosk.place}, {site.kiosk.city}
              </p>
            </div>

            <HoursThreshold />

            <div className="border-2 border-ink bg-ink px-5 py-5 text-paper">
              <p className="font-display text-2xl leading-none font-extrabold tracking-tight uppercase">
                {site.sundayMarket.name}
              </p>
              <p className="mt-3 text-paper/85">
                {site.sundayMarket.item} · {site.sundayMarket.hoursLabel}
              </p>
            </div>
          </div>

          <a
            href={site.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "default" }),
              "font-display mt-6 h-12 rounded-full px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Open in Google Maps
          </a>
        </div>

        <div className="overflow-hidden border-2 border-ink">
          <iframe
            title="Map of Streetscape, Banilad, Cebu"
            src={site.mapsEmbedUrl}
            className="h-[min(28rem,70vh)] w-full border-0 lg:h-full min-h-80"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
