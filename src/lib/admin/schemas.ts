import { z } from "zod";
import { branchIdSchema } from "../branches/schema";

export const businessTimezone = "Asia/Manila";
export const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const businessDateSchema = z.iso.date();
export const adminRoleSchema = z.enum(["owner", "staff"]);
/** Page access stored on the staff profile. Omitted keys are not grants. */
export const orderActionGrantSchema = z.object({
  processing: z.boolean().optional(),
  approve: z.boolean().optional(),
  preparing: z.boolean().optional(),
  ready: z.boolean().optional(),
  complete: z.boolean().optional(),
  delivered: z.boolean().optional(),
  cancel: z.boolean().optional(),
  revise: z.boolean().optional(),
  customerEdit: z.boolean().optional(),
  requirePayment: z.boolean().optional(),
  fee: z.boolean().optional(),
  pickup: z.boolean().optional(),
  rider: z.boolean().optional(),
  payment: z.boolean().optional(),
  refund: z.boolean().optional(),
  void: z.boolean().optional(),
  note: z.boolean().optional(),
});
/** Absent allocation action keys are not grants. Owners ignore this object. */
export const allocationActionGrantSchema = z.object({
  edit: z.boolean().optional(),
  pause: z.boolean().optional(),
  unlimited: z.boolean().optional(),
  lowerBelowHeld: z.boolean().optional(),
});
export const adminPageGrantSchema = z.object({
  dashboard: z.boolean().optional(),
  orders: z.boolean().optional(),
  schedule: z.boolean().optional(),
  allocation: z.boolean().optional(),
  catalog: z.boolean().optional(),
  orderActions: orderActionGrantSchema.optional(),
  allocationActions: allocationActionGrantSchema.optional(),
  catalogActions: z.object({ edit: z.boolean().optional() }).optional(),
  scheduleActions: z.object({ edit: z.boolean().optional(), bookingWindow: z.boolean().optional() }).optional(),
  kitchen: z.boolean().optional(),
  kitchenActions: z.object({ advance: z.boolean().optional() }).optional(),
});
export const adminProfileSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().max(100).optional(),
  role: adminRoleSchema,
  active: z.boolean(),
  branchIds: z.array(branchIdSchema).max(24).default([]),
  pages: adminPageGrantSchema.optional(),
});
export type AdminProfile = z.infer<typeof adminProfileSchema>;
export type AdminIdentity = AdminProfile & { uid: string };

export const orderStatusSchema = z.enum([
  "requested", "processing", "confirmed", "preparing", "ready", "completed", "cancelled", "expired",
]);
export const paymentStatusSchema = z.enum(["unpaid", "partially_paid", "paid", "refunded"]);
export const quoteStatusSchema = z.enum(["pending", "finalized"]);
export const variantSchema = z.discriminatedUnion("pricingMode", [
  z.object({
    label: z.string().trim().min(1).max(80),
    pricingMode: z.literal("fixed"),
    priceCentavos: moneySchema,
    minLeadDays: z.number().int().min(0).max(365),
    active: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  }),
  z.object({
    label: z.string().trim().min(1).max(80),
    pricingMode: z.literal("quote_required"),
    priceCentavos: z.null(),
    minLeadDays: z.number().int().min(0).max(365),
    active: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  }),
]);
export type ProductVariant = z.infer<typeof variantSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const sessionRequestSchema = z.object({
  idToken: z.string().min(1).max(16000),
}).strict();
