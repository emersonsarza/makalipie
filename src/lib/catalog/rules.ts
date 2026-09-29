import { dateSchema, type Catalog, type CatalogProduct, type Selection, type Variant } from "./schema";
export function manilaDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function availabilityReason(product: Pick<CatalogProduct, "active" | "availableWeekdays" | "unavailableDates">, variant: Variant, date: string, leadDays = 0, today = manilaDate()) {
  if (!product.active || !variant.active) return "This size is unavailable.";
  if (!dateSchema.safeParse(date).success) return "Choose a valid date.";
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  if (days < 0) return "Choose today or a future date.";
  const lead = Math.max(variant.minLeadDays, leadDays);
  if (days < lead) return `Needs at least ${lead} day${lead === 1 ? "" : "s"} of preparation.`;
  if (product.unavailableDates.includes(date)) return "Not available on this date.";
  if (product.availableWeekdays.length && !product.availableWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) return "Not baked on this weekday.";
  return null;
}
export function availabilityText(product: Pick<CatalogProduct, "availableWeekdays" | "unavailableDates">) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return product.availableWeekdays.length ? `Available ${product.availableWeekdays.map((d) => days[d]).join(", ")}` : "Available daily";
}
export function quoteSelection(catalog: Catalog, selection: Selection, today = manilaDate()) {
  const errors: string[] = []; const lines: string[] = []; let knownSubtotalCentavos = 0; let quoteRequired = false;
  const usedLines = new Set<string>();
  function addonsFor(selected: Selection["addons"], scope: "per_item" | "per_order", products: CatalogProduct[], quantity: number) {
    let total = 0; let lead = 0; const labels: string[] = []; const seen = new Set<string>();
    for (const chosen of selected) {
      const addon = catalog.addons.find((a) => a.id === chosen.id);
      if (seen.has(chosen.id)) { errors.push("An add-on was selected twice."); continue; } seen.add(chosen.id);
      if (!addon?.active || addon.scope !== scope || !products.some((p) => p.allowedAddonIds.includes(chosen.id))) { errors.push("An add-on is unavailable or incompatible with your pies."); continue; }
      if ((!addon.customization.enabled && chosen.message) || chosen.message.length > addon.customization.maxLength || (addon.customization.enabled && addon.customization.required && !chosen.message.trim())) errors.push(`Check the message for ${addon.name}.`);
      total += addon.priceCentavos * quantity; lead = Math.max(lead, addon.minLeadDays);
      labels.push(`${addon.name}${chosen.message ? `: “${chosen.message}”` : ""} (₱${(addon.priceCentavos * quantity / 100).toLocaleString("en-PH")}${scope === "per_item" ? ` for ${quantity}` : ""})`);
    }
    return { total, lead, labels };
  }
  const selectedProducts = selection.lines.flatMap((l) => catalog.products.find((p) => p.id === l.productId && p.active) ?? []);
  const orderAddons = addonsFor(selection.addons, "per_order", selectedProducts, 1);
  let preparationDays = orderAddons.lead;
  const days = (Date.parse(`${selection.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  if (days < orderAddons.lead) errors.push(`Your add-ons need ${orderAddons.lead} days of preparation.`);
  knownSubtotalCentavos += orderAddons.total;
  for (const line of selection.lines) {
    const key = `${line.productId}:${line.variantId}`;
    if (usedLines.has(key)) { errors.push("A product size was selected twice."); continue; } usedLines.add(key);
    const product = catalog.products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) { errors.push("A selected product or size is no longer available."); continue; }
    const extras = addonsFor(line.addons, "per_item", [product], line.quantity);
    preparationDays = Math.max(preparationDays, variant.minLeadDays, extras.lead);
    const reason = availabilityReason(product, variant, selection.date, extras.lead, today);
    if (reason) errors.push(`${product.name} · ${variant.label}: ${reason}`);
    const unit = variant.pricingMode === "fixed" ? variant.priceCentavos! : null;
    knownSubtotalCentavos += (unit ?? 0) * line.quantity + extras.total;
    quoteRequired ||= unit === null;
    lines.push(`${line.quantity} × ${product.name} · ${variant.label} (${unit === null ? "Price to confirm" : `₱${(unit / 100).toLocaleString("en-PH")} each`})${extras.labels.length ? `\n  + ${extras.labels.join("\n  + ")}` : ""}`);
  }
  return { errors, lines, addonLines: orderAddons.labels, knownSubtotalCentavos, quoteRequired, preparationDays };
}
