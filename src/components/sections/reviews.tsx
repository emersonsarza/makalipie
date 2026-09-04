import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { reviews, site } from "@/lib/site";

export function ReviewsSection() {
  return (
    <section id="reviews" className="scroll-mt-24 bg-butter/40 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
            Love notes
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Freshly baked happiness, shared.
          </h2>
          <p className="mt-4 max-w-xl text-lg text-charcoal/70">
            Don&apos;t forget to post pictures and tag{" "}
            <Link
              href={site.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-charcoal underline decoration-crust decoration-2 underline-offset-4"
            >
              @{site.instagramHandle}
            </Link>
            . Placeholder quotes for now — real ones coming soon.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {reviews.map((review, index) => (
            <Reveal key={review.name} delay={index * 50}>
              <blockquote className="border-l-2 border-crust pl-5">
                <p className="font-heading text-xl leading-snug text-charcoal">
                  “{review.quote}”
                </p>
                <footer className="mt-4 text-sm text-charcoal/65">
                  <span className="font-semibold text-charcoal">
                    {review.name}
                  </span>
                  <span className="mx-1.5 text-charcoal/35">·</span>
                  {review.context}
                </footer>
              </blockquote>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
