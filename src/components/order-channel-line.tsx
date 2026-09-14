import { getGrabFood } from "@/lib/site";
import { cn } from "@/lib/utils";

export function OrderChannelLine({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const grab = getGrabFood();

  return (
    <p
      className={cn(
        "text-sm leading-relaxed",
        tone === "dark" ? "text-cream/75" : "text-charcoal/60",
        className
      )}
    >
      Visit the kiosk · Instagram form or DM for pre-orders and specials
      {grab.linked ? (
        <>
          {" "}
          ·{" "}
          <a
            href={grab.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "font-semibold underline decoration-2 underline-offset-4",
              tone === "dark"
                ? "text-crust decoration-crust/70"
                : "text-charcoal decoration-crust"
            )}
          >
            GrabFood for classics
          </a>
        </>
      ) : null}
    </p>
  );
}
