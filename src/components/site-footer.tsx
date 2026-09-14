import { MapPin } from "lucide-react";
import Link from "next/link";

import { InstagramIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { getGrabFood, site } from "@/lib/site";

export function SiteFooter() {
  const grab = getGrabFood();

  return (
    <footer className="border-t border-charcoal/10 bg-charcoal text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark className="size-16" markId="footer-logo" />
            <div>
              <p className="font-heading text-2xl">Makalipie</p>
              <p className="text-sm text-cream/70">{site.tagline}</p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-cream/75">
            Proudly Cebuana-made tarts &amp; pies with a one-of-a-kind
            handcrafted crust. Come by Streetscape, or send us a little DM —
            we&apos;re friendlier than a warm slice.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-lg">Visit</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-cream/80">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {site.kiosk.floor}, {site.kiosk.place}
              <br />
              {site.kiosk.city}
              <br />
              {site.kiosk.hoursLabel}
            </span>
          </p>
          <p className="mt-4 text-sm text-cream/80">
            {site.sundayMarket.name}: {site.sundayMarket.item}
            <br />
            {site.sundayMarket.hoursLabel}
          </p>
        </div>

        <div>
          <h2 className="font-heading text-lg">Say hello</h2>
          <a
            href={site.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-crust hover:underline"
          >
            <InstagramIcon className="size-4" />
            @{site.instagramHandle}
          </a>
          <p className="mt-4 text-sm text-cream/70">
            {grab.linked ? (
              <>
                Classics:{" "}
                <a
                  href={grab.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-crust hover:underline"
                >
                  GrabFood
                </a>
                . Custom, corporate, and dessert tables — message us on
                Instagram.
              </>
            ) : (
              <>
                Custom, corporate, and dessert tables — message us on Instagram.
              </>
            )}
          </p>
          <Link
            href="/order"
            className="mt-5 inline-flex text-sm font-semibold text-crust hover:underline"
          >
            Open order form
          </Link>
        </div>
      </div>
      <div className="border-t border-cream/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-cream/50 sm:px-6">
          © {new Date().getFullYear()} Makalipie. Handmade in Cebu. EST.{" "}
          {site.established}.
        </p>
      </div>
    </footer>
  );
}
