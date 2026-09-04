import { MessageCircle, ShoppingBag, Store } from "lucide-react";

import { InstagramIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: InstagramIcon,
    title: "Message us on Instagram",
    body: "The fastest way for Buko pie (Fri–Sun), specials, corporate boxes, and anything custom. Tap through, tell us what you’re craving.",
    href: site.instagramDmUrl,
    cta: "Open Instagram DM",
    primary: true,
  },
  {
    icon: ShoppingBag,
    title: "GrabFood for classics",
    body: "Keylime, Pecan, S’mores, Banoffee, Oreo — search Makalipie on GrabFood when you want the regulars delivered.",
    href: site.grabFoodUrl,
    cta: "Find us on GrabFood",
    primary: false,
  },
  {
    icon: Store,
    title: "Come to the kiosk",
    body: "2nd Floor, Streetscape, Banilad. Daily 10AM–8PM. Sundays, look for Butter Chicken Curry pie at the market ~7AM–3PM.",
    href: "#visit",
    cta: "See location & hours",
    primary: false,
  },
] as const;

export function HowToOrderSection() {
  return (
    <section id="order" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
          How to order
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          No cart yet — just a friendly DM, GrabFood, or a walk-up.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-charcoal/70">
          Pre-ordering on this site is coming soon. Until then, these three
          paths get a pie in your hands.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="flex flex-col rounded-[1.6rem] bg-butter p-6 ring-1 ring-charcoal/8"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-cream text-charcoal">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <span className="font-heading text-2xl text-charcoal/25">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-5 font-heading text-2xl leading-tight">
                {step.title}
              </h3>
              <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-charcoal/70">
                {step.body}
              </p>
              <a
                href={step.href}
                target={step.href.startsWith("http") ? "_blank" : undefined}
                rel={step.href.startsWith("http") ? "noreferrer" : undefined}
                className={cn(
                  buttonVariants({
                    variant: step.primary ? "default" : "outline",
                  }),
                  "mt-6 h-11 rounded-full px-4 font-semibold",
                  step.primary && "bg-crust text-charcoal"
                )}
              >
                {step.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start gap-3 rounded-[1.6rem] bg-charcoal px-6 py-6 text-cream sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-crust" />
            <p className="max-w-xl text-sm leading-relaxed sm:text-base">
              <span className="font-semibold">Buko pie reminder:</span> it&apos;s
              our bestseller, Friday to Sunday only. Message us to order — we
              sell through for a reason.
            </p>
          </div>
          <a
            href={site.instagramDmUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-11 shrink-0 rounded-full px-5 font-semibold"
            )}
          >
            Message us to order
          </a>
        </div>
      </div>
    </section>
  );
}
