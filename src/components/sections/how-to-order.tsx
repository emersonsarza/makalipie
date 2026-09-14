import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { orderSteps, site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function HowToOrderSection() {
  return (
    <section id="order" className="scroll-mt-24 border-t-2 border-ink/20 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="font-display max-w-3xl text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
          Secure your Makalipies today — easy-peasy!
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Fill out the order form, copy your summary, and send it through our
          Instagram inbox. We&apos;ll confirm, invoice, and get your goodies
          moving.
        </p>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {orderSteps.map((step) => (
            <li
              key={step.step}
              className="flex flex-col border-2 border-ink bg-paper px-5 py-5 text-ink"
            >
              <p className="font-display text-sm font-bold tracking-[0.16em] uppercase">
                {step.step}. {step.title}
              </p>
              <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "default" }),
              "font-display h-12 rounded-full px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Open order form
          </Link>
          <Link
            href="/menu"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "font-display h-12 rounded-full border-2 border-ink px-6 text-base font-bold tracking-[0.06em] uppercase"
            )}
          >
            Browse the menu
          </Link>
          <a
            href={site.grabFoodUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-ink underline decoration-ink decoration-2 underline-offset-4 sm:ml-2"
          >
            Classics also on GrabFood
          </a>
        </div>
      </div>
    </section>
  );
}
