import { z } from "zod";
import { businessDateSchema } from "../admin/schemas";
import { branchIdSchema } from "../branches/schema";
import { selectionSchema } from "../catalog/schema";
import { clockTimeSchema } from "../scheduling/schema";

export const orderStatusSchema = z.enum(["requested", "processing", "confirmed", "preparing", "ready", "completed", "cancelled", "expired"]);

export const orderRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  branchId: branchIdSchema,
  slotId: clockTimeSchema,
  name: z.string().trim().min(1).max(100),
  contact: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(500).default(""),
  delivery: z.enum(["pickup", "lalamove"]),
  address: z.string().trim().max(300).default(""),
  payment: z.enum(["bank", "gcash", "cash"]),
  catalogMode: z.enum(["regular", "preorder"]).optional(),
  recoveryToken: z.string().trim().min(20).max(200).optional(),
  selection: selectionSchema,
}).strict().superRefine((input, ctx) => {
  if (input.delivery === "lalamove" && !input.address) {
    ctx.addIssue({ code: "custom", message: "Add a delivery address.", path: ["address"] });
  }
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;

export const guestStatusRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
}).strict();

export const recoveryDraftRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
}).strict();

export const guestReopenRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
  reopenKey: z.string().uuid(),
}).strict();

export const orderChangeSchema = z.object({
  field: z.string().min(1).max(40),
  from: z.string().max(200),
  to: z.string().max(200),
}).strict();
export type OrderChange = z.infer<typeof orderChangeSchema>;

export const orderEventSchema = z.object({
  at: z.string().min(10),
  actorUid: z.string().min(1),
  action: z.enum(["processing", "approve", "reject", "expire", "preparing", "ready", "complete", "revise", "settle", "deliverable", "delivered", "reopen", "reorder"]),
  previousStatus: orderStatusSchema,
  status: orderStatusSchema,
  reason: z.string().min(1).max(300).optional(),
  changes: z.array(orderChangeSchema).max(12).optional(),
}).strict();
export type OrderEvent = z.infer<typeof orderEventSchema>;

export const paymentMethodSchema = z.enum(["bank", "gcash", "cash"]);
export const paymentRecordSchema = z.object({
  at: z.string().min(10),
  actorUid: z.string().min(1),
  method: paymentMethodSchema,
  amountCentavos: z.number().int().positive(),
  kind: z.enum(["payment", "refund"]).optional(),
}).strict();
export type PaymentRecord = z.infer<typeof paymentRecordSchema>;

const revisableStatusSchema = z.enum(["requested", "processing", "confirmed", "preparing", "ready"]);
const recoverableStatusSchema = z.enum(["expired", "cancelled"]);

export const orderActionSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(["processing", "approve", "reject", "pay", "preparing", "ready", "complete", "revise", "settle", "deliverable", "delivered", "review", "reopen", "reorder"]),
  expectedStatus: z.enum(["requested", "processing", "confirmed", "preparing", "ready", "expired", "cancelled"]),
  idempotencyKey: z.string().uuid().optional(),
  reopenKey: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(300).optional(),
  method: paymentMethodSchema.optional(),
  amountCentavos: z.number().int().positive().optional(),
  kind: z.enum(["payment", "refund"]).optional(),
  branchId: branchIdSchema.optional(),
  slotId: clockTimeSchema.optional(),
  selection: selectionSchema.optional(),
  feeCentavos: z.number().int().nonnegative().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.action === "reject" && !input.reason) {
    ctx.addIssue({ code: "custom", message: "Add a reason.", path: ["reason"] });
  }
  if (input.action === "reject" && input.expectedStatus !== "requested" && input.expectedStatus !== "processing" && input.expectedStatus !== "confirmed") {
    ctx.addIssue({ code: "custom", message: "Reject a request before preparation.", path: ["expectedStatus"] });
  }
  if (input.action === "processing" && input.expectedStatus !== "requested") {
    ctx.addIssue({ code: "custom", message: "Start processing from a request that is still pending.", path: ["expectedStatus"] });
  }
  if (input.action === "approve" && input.expectedStatus !== "processing") {
    ctx.addIssue({ code: "custom", message: "Approve a request that is in processing.", path: ["expectedStatus"] });
  }
  if (input.action === "pay" && input.expectedStatus !== "confirmed") {
    ctx.addIssue({ code: "custom", message: "Record payment after the request is approved.", path: ["expectedStatus"] });
  }
  if (input.action === "pay" && !input.method) {
    ctx.addIssue({ code: "custom", message: "Choose how the payment was received.", path: ["method"] });
  }
  if (input.action === "preparing" && input.expectedStatus !== "confirmed") {
    ctx.addIssue({ code: "custom", message: "Start preparing from an approved request.", path: ["expectedStatus"] });
  }
  if (input.action === "ready" && input.expectedStatus !== "preparing") {
    ctx.addIssue({ code: "custom", message: "Mark a request ready after preparation.", path: ["expectedStatus"] });
  }
  if (input.action === "complete" && input.expectedStatus !== "ready") {
    ctx.addIssue({ code: "custom", message: "Complete a request that is ready for pickup.", path: ["expectedStatus"] });
  }
  if ((input.action === "revise" || input.action === "settle") && !revisableStatusSchema.safeParse(input.expectedStatus).success) {
    ctx.addIssue({ code: "custom", message: "Revise a request before it is completed.", path: ["expectedStatus"] });
  }
  if (input.action === "revise" && !input.selection) {
    ctx.addIssue({ code: "custom", message: "Choose the pies to keep.", path: ["selection"] });
  }
  if (input.action === "revise" && !input.branchId) {
    ctx.addIssue({ code: "custom", message: "Choose a branch.", path: ["branchId"] });
  }
  if (input.action === "revise" && !input.slotId) {
    ctx.addIssue({ code: "custom", message: "Choose a time.", path: ["slotId"] });
  }
  if (input.action === "settle" && !input.kind) {
    ctx.addIssue({ code: "custom", message: "Record the amount due or the refund due.", path: ["kind"] });
  }
  if (input.action === "settle" && !input.method) {
    ctx.addIssue({ code: "custom", message: "Choose how the payment was received.", path: ["method"] });
  }
  if (input.action === "settle" && input.amountCentavos === undefined) {
    ctx.addIssue({ code: "custom", message: "Record the exact difference.", path: ["amountCentavos"] });
  }
  if (input.action === "deliverable" && input.expectedStatus !== "requested" && input.expectedStatus !== "processing" && input.expectedStatus !== "confirmed") {
    ctx.addIssue({ code: "custom", message: "Confirm a delivery address before preparation.", path: ["expectedStatus"] });
  }
  if (input.action === "deliverable" && input.feeCentavos === undefined) {
    ctx.addIssue({ code: "custom", message: "Record the delivery fee.", path: ["feeCentavos"] });
  }
  if (input.action === "delivered" && input.expectedStatus !== "preparing") {
    ctx.addIssue({ code: "custom", message: "Mark a delivery delivered after preparation.", path: ["expectedStatus"] });
  }
  const recoverable = recoverableStatusSchema.safeParse(input.expectedStatus).success;
  if ((input.action === "review" || input.action === "reopen" || input.action === "reorder") && !recoverable) {
    ctx.addIssue({ code: "custom", message: "Recover an expired or cancelled request.", path: ["expectedStatus"] });
  }
  if (input.action !== "review" && input.action !== "reopen" && input.action !== "reorder" && recoverable) {
    ctx.addIssue({ code: "custom", message: "This request is closed.", path: ["expectedStatus"] });
  }
  if (input.action === "reopen" && !input.reopenKey) {
    ctx.addIssue({ code: "custom", message: "Reopen this request once.", path: ["reopenKey"] });
  }
  if (input.action === "reorder" && !input.idempotencyKey) {
    ctx.addIssue({ code: "custom", message: "Confirm this reorder once.", path: ["idempotencyKey"] });
  }
  if (input.action === "reorder" && !input.selection) {
    ctx.addIssue({ code: "custom", message: "Choose the pies to keep.", path: ["selection"] });
  }
  if (input.action === "reorder" && !input.branchId) {
    ctx.addIssue({ code: "custom", message: "Choose a branch.", path: ["branchId"] });
  }
  if (input.action === "reorder" && !input.slotId) {
    ctx.addIssue({ code: "custom", message: "Choose a time.", path: ["slotId"] });
  }
});
export type OrderAction = z.infer<typeof orderActionSchema>;

export const inboxOrderSchema = z.object({
  id: z.string().min(1),
  orderNumber: z.string().min(1),
  branchId: branchIdSchema,
  fulfillmentDate: businessDateSchema,
  slotId: clockTimeSchema,
  slotLabel: z.string().min(1),
  customerName: z.string(),
  contact: z.string(),
  address: z.string(),
  delivery: z.enum(["pickup", "lalamove"]),
  deliveryEligibility: z.enum(["pending", "eligible"]).optional(),
  deliveryFeeCentavos: z.number().int().nonnegative().nullable().optional(),
  payment: z.enum(["bank", "gcash", "cash"]),
  catalogMode: z.enum(["regular", "preorder"]),
  preparationDays: z.number().int().nonnegative(),
  notes: z.string(),
  lines: z.array(z.string()),
  addonLines: z.array(z.string()),
  selection: selectionSchema.optional(),
  knownSubtotalCentavos: z.number().int().nonnegative(),
  quoteStatus: z.enum(["pending", "finalized"]),
  finalTotalCentavos: z.number().int().nonnegative().nullable(),
  paymentStatus: z.enum(["unpaid", "partially_paid", "paid", "refunded"]),
  netReceivedCentavos: z.number().int().nonnegative(),
  payments: z.array(paymentRecordSchema).max(10),
  deadline: z.string().min(10),
  submittedAt: z.string().min(10),
  processingStartedAt: z.string().min(10).optional(),
  status: orderStatusSchema,
  events: z.array(orderEventSchema).max(40),
  sourceOrderNumber: z.string().min(1).optional(),
}).strict();
export type InboxOrder = z.infer<typeof inboxOrderSchema>;

export function orderIntakeEnabled() {
  return process.env.ORDER_INTAKE_ENABLED === "true" || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}

export function ordersVisibleTo(role: "owner" | "staff", branchIds: string[], orders: InboxOrder[]) {
  if (role === "owner") return orders;
  const allowed = new Set(branchIds);
  return orders.filter((order) => allowed.has(order.branchId));
}
