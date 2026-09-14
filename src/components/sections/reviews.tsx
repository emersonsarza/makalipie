import Image from "next/image";
import Link from "next/link";

import { site } from "@/lib/site";

export function TagSection() {
  return (
    <section id="tag" className="scroll-mt-24 border-t-2 border-ink/20 py-14 sm:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="font-display text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-5xl">
            Enjoy your freshly baked tarts and pies.
          </h2>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Don&apos;t forget to post pictures and tag{" "}
            <Link
              href={site.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-ink underline decoration-ink decoration-2 underline-offset-4"
            >
              @{site.instagramHandle}
            </Link>
            . We keep the compliments in the DMs until we have names we can
            print.
          </p>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden border-2 border-ink bg-ink">
          <Image
            src="/brand/social-tag.jpg"
            alt="Makalipie tarts and pies with a note to tag us on socials"
            fill
            sizes="(max-width: 1024px) 100vw, 40vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
