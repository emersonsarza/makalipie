import Link from "next/link";

import { OrderChannelLine } from "@/components/order-channel-line";
import { Reveal } from "@/components/reveal";
import { buttonVariants } from "@/components/ui/button";
import { orderSteps } from "@/lib/site";
import { cn } from "@/lib/utils";

export function HowToOrderSection() {
  return (
    <section id="order" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Secure your Makalipies today. Easy-peasy.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-charcoal/70">
            Fill out the order form, copy your summary, and send it through our
            Instagram inbox. We&apos;ll confirm, invoice, and get your goodies
            moving.
          </p>
        </Reveal>

        <ol className="relative mt-10 max-w-3xl list-none space-y-0 p-0">
          {orderSteps.map((step, index) => (
            <Reveal
              key={step.step}
              delay={index * 40}
              as="li"
              className="relative grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-8 last:pb-0"
            >
              {index < orderSteps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-10 bottom-0 left-[1.15rem] w-px bg-charcoal/12"
                />
              ) : null}
              <span className="relative z-10 flex size-9 items-center justify-center rounded-full bg-crust font-heading text-sm font-bold text-charcoal ring-4 ring-cream">
                {step.step}
              </span>
              <div className="pt-1">
                <p className="font-heading text-xl font-semibold tracking-tight">
                  {step.title}
                </p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-charcoal/75">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>

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
            See the menu
          </Link>
        </Reveal>
        <OrderChannelLine className="mt-4" />
      </div>
    </section>
  );
}
