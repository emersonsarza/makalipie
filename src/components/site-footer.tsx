import { MapPin } from "lucide-react";
import Link from "next/link";

import { InstagramIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink/30 bg-mustard text-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark className="size-16" />
            <div>
              <p className="font-display text-2xl font-extrabold tracking-tight uppercase">
                Makalipie
              </p>
              <p className="text-sm text-ink-soft">{site.tagline}</p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">
            Proudly Cebuana-made tarts &amp; pies with a one-of-a-kind
            handcrafted crust. Come by Streetscape, or send us a little DM —
            we&apos;re friendlier than a warm slice.
          </p>
        </div>

        <div>
          <h2 className="font-display text-lg font-extrabold tracking-tight uppercase">
            Visit
          </h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {site.kiosk.floor}, {site.kiosk.place}
              <br />
              {site.kiosk.city}
              <br />
              {site.kiosk.hoursLabel}
            </span>
          </p>
          <p className="mt-4 text-sm text-ink-soft">
            {site.sundayMarket.name}: {site.sundayMarket.item}
            <br />
            {site.sundayMarket.hoursLabel}
          </p>
        </div>

        <div>
          <h2 className="font-display text-lg font-extrabold tracking-tight uppercase">
            Say hello
          </h2>
          <a
            href={site.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-ink underline decoration-2 underline-offset-4"
          >
            <InstagramIcon className="size-4" />
            @{site.instagramHandle}
          </a>
          <p className="mt-4 text-sm text-ink-soft">
            Classic flavors also on GrabFood. Custom, corporate, and dessert
            tables — message us on Instagram.
          </p>
          <Link
            href="/order"
            className="font-display mt-5 inline-flex text-sm font-bold tracking-[0.06em] uppercase underline decoration-2 underline-offset-4"
          >
            Order via form
          </Link>
        </div>
      </div>
      <div className="border-t-2 border-ink/20">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs font-bold tracking-wide text-ink-soft uppercase sm:px-6">
          © {new Date().getFullYear()} Makalipie. Handmade in Cebu. EST.{" "}
          {site.established}.
        </p>
      </div>
    </footer>
  );
}
