import { CircleAlert, Clock3, PackageCheck, type LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  orderStatusLabel,
  orderStatusTone,
  type OrderDelivery,
  type OrderStatus,
} from "@/lib/orders/status-display";

const badgeVariants = cva(
  "inline-flex w-fit max-w-full items-center font-semibold whitespace-nowrap rounded-full",
  {
    variants: {
      size: {
        sm: "gap-1.5 px-2 py-1 text-[10px] leading-none",
        md: "gap-2 px-3 py-2 text-xs leading-none",
      },
      tone: {
        awaiting: "bg-[var(--color-butter)] text-[var(--admin-ink,#2c2a28)]",
        approved: "bg-[color-mix(in_srgb,var(--color-crust)_28%,white)] text-[var(--admin-ink,#2c2a28)]",
        ready: "bg-[#e5f2e8] text-[#27553a]",
        done: "bg-[var(--color-cream)] text-[var(--admin-ink,#2c2a28)]",
        closed: "bg-[#eceae6] text-[var(--admin-muted,#656466)]",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "awaiting",
    },
  }
);

function statusIcon(status: OrderStatus): LucideIcon {
  if (status === "expired" || status === "cancelled") return CircleAlert;
  if (status === "ready" || status === "completed") return PackageCheck;
  return Clock3;
}

export function OrderStatusBadge({
  status,
  delivery = "pickup",
  size = "md",
  className,
}: {
  status: OrderStatus;
  delivery?: OrderDelivery;
  size?: NonNullable<VariantProps<typeof badgeVariants>["size"]>;
  className?: string;
}) {
  const Icon = statusIcon(status);
  const iconSize = size === "sm" ? 13 : 16;
  return (
    <span className={cn(badgeVariants({ size, tone: orderStatusTone(status) }), className)} data-slot="order-status-badge">
      <Icon size={iconSize} strokeWidth={1.7} aria-hidden />
      <span>{orderStatusLabel(status, delivery)}</span>
    </span>
  );
}
