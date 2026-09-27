import { z } from "zod";

export const businessTimezone = "Asia/Manila";
export const moneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const businessDateSchema = z.iso.date();
export const adminRoleSchema = z.enum(["owner", "staff"]);
export const adminProfileSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().max(100).optional(),
  role: adminRoleSchema,
  active: z.boolean(),
});
export type AdminProfile = z.infer<typeof adminProfileSchema>;
export type AdminIdentity = AdminProfile & { uid: string };

export const orderStatusSchema = z.enum([
  "requested", "confirmed", "preparing", "ready", "completed", "cancelled", "expired",
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
