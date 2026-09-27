import { z } from "zod";
import { businessDateSchema, moneySchema } from "../admin/schemas";

export const DEFAULT_RESERVATION_MINUTES = 30;
export const DEFAULT_BOOKING_HORIZON_DAYS = 30;

// One pool per branch and fulfillment day, independent of catalog or method.
export const capacityScopeSchema = z.object({
  branchId: z.enum(["cebu", "manila"]),
  fulfillmentDate: businessDateSchema,
}).strict();

export const orderingPolicySchema = z.object({
  reservationMinutes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_RESERVATION_MINUTES),
  bookingHorizonDays: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_BOOKING_HORIZON_DAYS),
  cutoffScope: z.literal("same_day_only").default("same_day_only"),
  capacityPool: z.literal("shared_daily_orders").default("shared_daily_orders"),
  paymentBeforePreparation: z.literal(true).default(true),
}).strict();

export const defaultOrderingPolicy = Object.freeze(orderingPolicySchema.parse({}));

export function dailyCapacityKey(branchId: string, fulfillmentDate: string) {
  const scope = capacityScopeSchema.parse({ branchId, fulfillmentDate });
  return `${scope.branchId}_${scope.fulfillmentDate}`;
}

// The future order service must pass trusted server time, not client timestamps.
export function initialReservationDeadline(
  submittedAt: Date,
  policy: unknown = defaultOrderingPolicy,
) {
  const { reservationMinutes } = orderingPolicySchema.parse(policy);
  const deadline = new Date(submittedAt.getTime() + reservationMinutes * 60_000);
  if (!Number.isFinite(submittedAt.getTime()) || !Number.isFinite(deadline.getTime())) {
    throw new Error("A reservation requires a valid submission time and duration.");
  }
  return deadline;
}

const preparationPaymentSchema = z.object({
  quoteStatus: z.literal("finalized"),
  paymentStatus: z.literal("paid"),
  finalTotalCentavos: moneySchema,
  netReceivedCentavos: moneySchema,
});

// Approval alone is insufficient. Recheck the actual balance after staff edits.
// Only staff-verified payment records may supply these server-side values.
export function assertPaymentBeforePreparation(payment: unknown): void {
  const parsed = preparationPaymentSchema.safeParse(payment);
  if (!parsed.success || parsed.data.netReceivedCentavos < parsed.data.finalTotalCentavos) {
    throw new Error("Finalize the total and verify full payment before preparation.");
  }
}
