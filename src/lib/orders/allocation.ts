import { z } from "zod";
import { businessDateSchema } from "../admin/schemas";
import { branchIdSchema } from "../branches/schema";
import { productIdSchema } from "../products/schema";
import { dailyCapacityKey } from "./policy";

export const allocationRecordSchema = z.object({
  branchId: branchIdSchema,
  fulfillmentDate: businessDateSchema,
  productId: productIdSchema,
  limit: z.number().int().min(0).max(500).nullable(),
  held: z.number().int().min(0).max(100_000),
  version: z.number().int().nonnegative(),
}).strict();
export type AllocationRecord = z.infer<typeof allocationRecordSchema>;

export const allocationDaySchema = z.object({
  branchId: branchIdSchema,
  fulfillmentDate: businessDateSchema,
  paused: z.boolean(),
  version: z.number().int().nonnegative(),
}).strict();
export type AllocationDay = z.infer<typeof allocationDaySchema>;

const allocationLimitSchema = z.object({
  fulfillmentDate: businessDateSchema,
  limit: z.number().int().min(0).max(500).nullable(),
  version: z.number().int().nonnegative(),
}).strict();

export const allocationSaveSchema = z.object({
  branchId: branchIdSchema,
  productId: productIdSchema,
  days: z.array(allocationLimitSchema).max(366),
  pause: z.object({
    paused: z.boolean(),
    version: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict().refine((input) => input.days.length > 0 || input.pause, "Choose a flavor limit or today's pause.").refine((input) => new Set(input.days.map((day) => day.fulfillmentDate)).size === input.days.length, "Do not repeat a date.");

export type AllocationSave = z.infer<typeof allocationSaveSchema>;

export type FlavorHold = { productId: string; quantity: number };

export function flavorCapacityKey(branchId: string, fulfillmentDate: string, productId: string) {
  return `${dailyCapacityKey(branchId, fulfillmentDate)}_${productIdSchema.parse(productId)}`;
}

/** A missing allocation or a blank limit stays open. A saved number, including zero, caps the flavor. Pausing today closes every flavor. */
export function capacityOpen(entry: Pick<AllocationRecord, "limit" | "held"> | null | undefined, date: string, today: string, dayPaused = false) {
  if (date === today && dayPaused) return false;
  if (!entry || entry.limit == null) return true;
  return entry.held < entry.limit;
}

/** True when this flavor can take the requested pie count. A blank limit has room; a saved number must cover the pies. */
export function flavorHasRoom(entry: Pick<AllocationRecord, "limit" | "held"> | null | undefined, quantity: number, date: string, today: string, dayPaused = false) {
  if (!Number.isInteger(quantity) || quantity < 1) return false;
  if (date === today && dayPaused) return false;
  if (!entry || entry.limit == null) return true;
  return entry.held + quantity <= entry.limit;
}

/** Sizes of one flavor add together. Callers pass pie lines only, so add-ons are not counted. */
export function flavorQuantities(lines: { productId: string; quantity: number }[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("A flavor quantity must be a whole number of pies.");
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([productId, quantity]) => ({ productId, quantity }));
}

export function heldAfterFlavor(held: number, quantity: number) {
  if (!Number.isInteger(held) || held < 0 || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("A reservation needs a saved hold count and at least one pie.");
  }
  return held + quantity;
}

export function flavorAvailabilityMessage(names: string[]) {
  const unique = [...new Set(names)];
  if (unique.length === 1) return `${unique[0]} doesn't have enough online availability on that date. Lower the quantity or choose another date.`;
  return `${unique.join(", ")} don't have enough online availability on that date. Lower the quantity or choose another date.`;
}

/** An explicit date stays put. Only an empty choice follows the earliest open date. */
export function displayedOrderDate(preferred: string | undefined, available: string[]) {
  return preferred || available[0] || "";
}
