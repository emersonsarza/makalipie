import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { buttonVariants } from "@/components/ui/button";
import { orderSteps, site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function HowToOrderSection() {
  return (
    <section id="order" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
            How to order
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Secure your Makalipies today — easy-peasy!
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-charcoal/70">
            Fill out the order form, copy your summary, and send it through our
            Instagram inbox. We&apos;ll confirm, invoice, and get your goodies
            moving.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {orderSteps.map((step, index) => (
            <Reveal
              key={step.step}
              delay={index * 50}
              className="flex flex-col rounded-[1.6rem] bg-butter p-6 ring-1 ring-charcoal/8"
            >
              <p className="text-sm font-bold tracking-[0.16em] text-crust uppercase">
                {step.step}. {step.title}
              </p>
              <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-charcoal/75">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-12 rounded-full px-6 text-base font-semibold"
            )}
          >
            Open order form
          </Link>
          <Link
            href="/menu"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-12 rounded-full border-charcoal/15 bg-cream px-6 text-base font-semibold"
            )}
          >
            Browse the menu
          </Link>
          <a
            href={site.grabFoodUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-charcoal underline decoration-crust decoration-2 underline-offset-4 sm:ml-2"
          >
            Classics also on GrabFood
          </a>
        </Reveal>
      </div>
    </section>
  );
}
