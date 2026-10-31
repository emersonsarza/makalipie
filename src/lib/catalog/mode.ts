import { customerSizeLabel } from "./size";

export type OrderMode = "regular" | "preorder";

type ModeVariant = { orderMode?: OrderMode; minLeadDays: number; label: string };

/** Explicit mode wins. Older 4-inch sizes stay on the regular menu until a mode is saved. */
export function variantOrderMode(variant: ModeVariant): OrderMode {
  if (variant.orderMode === "regular" || variant.orderMode === "preorder") return variant.orderMode;
  if (customerSizeLabel(variant.label) === '4"') return "regular";
  return variant.minLeadDays > 0 ? "preorder" : "regular";
}

/** Pre-order sizes use the shop setting once their mode is saved. Older rows keep their own lead time. */
export function preparationLeadDays(variant: ModeVariant, preorderLeadDays = 3) {
  if (variantOrderMode(variant) === "regular") return 0;
  return variant.orderMode === "preorder" ? preorderLeadDays : variant.minLeadDays;
}

/** Empty or a full week means every day. A shorter list is the only schedule. */
export function scheduledWeekdays(days: number[] | undefined) {
  if (!days || days.length === 0 || days.length >= 7) return [];
  return days;
}
