import Image from "next/image";

import { formatPrice, type MenuItem } from "@/lib/site";
import { cn } from "@/lib/utils";

type PiePlateProps = {
  item: MenuItem;
  className?: string;
  tilt?: number;
  sizes?: string;
  priority?: boolean;
  showCopy?: boolean;
};

export function PiePlate({
  item,
  className,
  tilt = -6,
  sizes = "(max-width: 768px) 80vw, 28vw",
  priority = false,
  showCopy = true,
}: PiePlateProps) {
  return (
    <figure className={cn("pie-plate relative mx-auto w-full max-w-sm", className)}>
      {item.image ? (
        <div className="relative aspect-[5/4]">
          <Image
            src={item.image.src}
            alt={item.image.alt}
            fill
            priority={priority}
            sizes={sizes}
            className="object-contain object-bottom"
          />
          {item.price != null ? (
            <span
              className="price-oval absolute right-1 bottom-2 text-lg sm:text-xl"
              style={{ rotate: `${tilt}deg` }}
            >
              {formatPrice(item.price)}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-[5/4] items-center justify-center bg-ink px-6 text-center text-paper">
          <p className="font-display text-3xl leading-none font-extrabold tracking-tight uppercase">
            {item.name}
          </p>
        </div>
      )}
      <figcaption className="mt-3 text-center">
        <p className="font-display text-3xl leading-none font-extrabold tracking-tight uppercase">
          {item.name}
        </p>
        {showCopy ? (
          item.note ? (
            <p className="mt-2 text-sm font-bold text-ink-soft">{item.note}</p>
          ) : item.blurb ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.blurb}</p>
          ) : null
        ) : null}
      </figcaption>
    </figure>
  );
}
