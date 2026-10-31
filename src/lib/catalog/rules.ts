import { preparationLeadDays, scheduledWeekdays, variantOrderMode } from "./mode";
import { dateSchema, type Catalog, type CatalogProduct, type Selection, type Variant } from "./schema";
export function manilaDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export type AvailabilityBlocker = { code: "inactive" | "invalid_date" | "past_date" | "preparation" | "date_exception" | "weekday"; message: string };
export function availabilityStatus(product: Pick<CatalogProduct, "active" | "availableWeekdays" | "unavailableDates">, variant: Variant, date: string, leadDays = 0, today = manilaDate(), options?: { categoryWeekdays?: number[]; preorderLeadDays?: number; preparationStart?: string }): { blockers: AvailabilityBlocker[] } {
  if (!product.active || !variant.active) return { blockers: [{ code: "inactive", message: "This size is unavailable." }] };
  if (!dateSchema.safeParse(date).success) return { blockers: [{ code: "invalid_date", message: "Choose a valid date." }] };
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  if (days < 0) return { blockers: [{ code: "past_date", message: "Choose today or a future date." }] };
  const blockers: AvailabilityBlocker[] = [];
  const lead = Math.max(preparationLeadDays(variant, options?.preorderLeadDays ?? 3), leadDays);
  const preparationBase = variantOrderMode(variant) === "preorder" ? options?.preparationStart ?? today : today;
  const preparationDays = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${preparationBase}T00:00:00Z`)) / 86400000;
  if (preparationDays < lead) blockers.push({ code: "preparation", message: `Needs at least ${lead} day${lead === 1 ? "" : "s"} of preparation.` });
  if (product.unavailableDates.includes(date)) blockers.push({ code: "date_exception", message: "Not available on this date." });
  const listed = variantOrderMode(variant) === "preorder" ? [] : scheduledWeekdays(options?.categoryWeekdays !== undefined ? options.categoryWeekdays : (variant.availableWeekdays ?? product.availableWeekdays));
  if (listed.length && !listed.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) blockers.push({ code: "weekday", message: "Not baked on this weekday." });
  return { blockers };
}
/** Keep legacy validation messages and precedence stable. */
export function availabilityReason(...args: Parameters<typeof availabilityStatus>) {
  return availabilityStatus(...args).blockers[0]?.message ?? null;
}
export function availabilityText(product: Pick<CatalogProduct, "availableWeekdays" | "unavailableDates">, variant?: Variant, categoryWeekdays?: number[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (variant && variantOrderMode(variant) === "preorder") return "Available on open branch days";
  const weekdays = scheduledWeekdays(categoryWeekdays !== undefined ? categoryWeekdays : (variant?.availableWeekdays ?? product.availableWeekdays));
  return weekdays.length ? `Available ${weekdays.map((d) => days[d]).join(", ")}` : "Available daily";
}
export function quoteSelection(catalog: Catalog, selection: Selection, today = manilaDate(), options?: { preparationStart?: string }) {
  const errors: string[] = []; const lines: string[] = []; let knownSubtotalCentavos = 0; let quoteRequired = false;
  const usedLines = new Set<string>();
  function addonsFor(selected: Selection["addons"], scope: "per_item" | "per_order", products: CatalogProduct[], quantity: number) {
    let total = 0; let lead = 0; const labels: string[] = []; const seen = new Set<string>();
    for (const chosen of selected) {
      const addon = catalog.addons.find((a) => a.id === chosen.id);
      if (seen.has(chosen.id)) { errors.push("An add-on was selected twice."); continue; } seen.add(chosen.id);
      if (!addon?.active || addon.scope !== scope) { errors.push("An add-on is no longer available."); continue; }
      if ((!addon.customization.enabled && chosen.message) || chosen.message.length > addon.customization.maxLength || (addon.customization.enabled && addon.customization.required && !chosen.message.trim())) errors.push(`Check the message for ${addon.name}.`);
      total += addon.priceCentavos * quantity; lead = Math.max(lead, addon.minLeadDays);
      labels.push(`${addon.name}${chosen.message ? `: “${chosen.message}”` : ""} (₱${(addon.priceCentavos * quantity / 100).toLocaleString("en-PH")}${scope === "per_item" ? ` for ${quantity}` : ""})`);
    }
    return { total, lead, labels };
  }
  const selectedProducts = selection.lines.flatMap((l) => catalog.products.find((p) => p.id === l.productId && p.active) ?? []);
  const orderAddons = addonsFor(selection.addons, "per_order", selectedProducts, 1);
  let preparationDays = orderAddons.lead;
  const hasPreorder = selection.lines.some(line=>{
    const variant=catalog.products.find(product=>product.id===line.productId)?.variants.find(variant=>variant.id===line.variantId);
    return variant && variantOrderMode(variant) === "preorder";
  });
  const addonBase = hasPreorder ? options?.preparationStart ?? today : today;
  const days = (Date.parse(`${selection.date}T00:00:00Z`) - Date.parse(`${addonBase}T00:00:00Z`)) / 86400000;
  if (days < orderAddons.lead) errors.push(`Your add-ons need ${orderAddons.lead} days of preparation.`);
  knownSubtotalCentavos += orderAddons.total;
  for (const line of selection.lines) {
    const key = `${line.productId}:${line.variantId}`;
    if (usedLines.has(key)) { errors.push("A product size was selected twice."); continue; } usedLines.add(key);
    const product = catalog.products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) { errors.push("A selected product or size is no longer available."); continue; }
    for (const chosen of [...line.addons, ...selection.addons]) if (!product.allowedAddonIds.includes(chosen.id)) errors.push(`${product.name}: an add-on is incompatible with this pie.`);
    const extras = addonsFor(line.addons, "per_item", [product], line.quantity);
    const section = catalog.sections.find((item) => item.id === product.menuCategoryId);
    const categoryWeekdays = section?.availableWeekdays;
    preparationDays = Math.max(preparationDays, preparationLeadDays(variant, catalog.preorderLeadDays ?? 3), extras.lead);
    const reason = availabilityReason(product, variant, selection.date, extras.lead, today, { categoryWeekdays, preorderLeadDays: catalog.preorderLeadDays ?? 3, preparationStart: options?.preparationStart });
    if (reason) errors.push(`${product.name} · ${variant.label}: ${reason}`);
    const unit = variant.pricingMode === "fixed" ? variant.priceCentavos! : null;
    knownSubtotalCentavos += (unit ?? 0) * line.quantity + extras.total;
    quoteRequired ||= unit === null;
    lines.push(`${line.quantity} × ${product.name} · ${variant.label} (${unit === null ? "Price to confirm" : `₱${(unit / 100).toLocaleString("en-PH")} each`})${extras.labels.length ? `\n  + ${extras.labels.join("\n  + ")}` : ""}`);
  }
  return { errors, lines, addonLines: orderAddons.labels, knownSubtotalCentavos, quoteRequired, preparationDays };
}
