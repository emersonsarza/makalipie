import { MapPin, Store, Sun } from "lucide-react";

import { KioskStatus } from "@/components/kiosk-status";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function VisitSection() {
  return (
    <section id="visit" className="scroll-mt-24 bg-butter/60 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Pie heaven on the 2nd floor.
          </h2>
          <p className="mt-4 text-lg text-charcoal/75">
            Find us at Streetscape, Banilad. The kiosk is open every day, and
            Sundays have a savory plot twist.
          </p>

          <div className="mt-8 space-y-4">
            <div className="rounded-3xl bg-cream p-5 ring-1 ring-charcoal/8">
              <p className="flex items-center gap-2 font-heading text-xl">
                <Store className="size-5" aria-hidden />
                {site.kiosk.name}
              </p>
              <p className="mt-2 flex items-start gap-2 text-charcoal/75">
                <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
                {site.kiosk.floor}, {site.kiosk.place}, {site.kiosk.city}
              </p>
              <KioskStatus className="mt-3 text-charcoal" />
            </div>

            <div className="rounded-3xl bg-charcoal p-5 text-cream">
              <p className="flex items-center gap-2 font-heading text-xl">
                <Sun className="size-5 text-crust" aria-hidden />
                {site.sundayMarket.name}
              </p>
              <p className="mt-2 text-cream/80">
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
              "mt-6 h-12 rounded-full px-6 text-base font-semibold"
            )}
          >
            Open in Google Maps
          </a>
        </div>

        <div className="overflow-hidden rounded-[2rem] ring-1 ring-charcoal/10">
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
