import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center justify-center rounded-full border border-transparent px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        berry: "bg-berry text-white",
        charcoal: "bg-charcoal text-cream",
        outline: "border-charcoal/15 bg-cream/80 text-charcoal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
