import type { MenuItem } from "@/lib/site";
import { preparationLeadDays, scheduledWeekdays, variantOrderMode } from "@/lib/catalog/mode";
import { customerSizeLabel } from "@/lib/catalog/size";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function CatalogDetails({ item, hideSize = false }: { item: MenuItem; hideSize?: boolean }) {
  const sizes = (item.variants ?? []).filter(v => v.active).sort((a,b) => a.sortOrder - b.sortOrder);
  if (!sizes.length) return null;
  return <div className="public-catalog-details"><ul aria-label={`${item.name} sizes and prices`}>{sizes.map(variant => {
    const preorder = variantOrderMode(variant) === "preorder";
    const weekdays = preorder ? [] : scheduledWeekdays(variant.availableWeekdays ?? item.availableWeekdays);
    const dayText = weekdays.length ? `Available ${[...new Set(weekdays)].sort((a,b) => (a || 7)-(b || 7)).map(day => days[day]).join(", ")}` : "";
    const lead = preparationLeadDays(variant);
    return <li key={variant.id}><div className="size-price-row">{!hideSize && <span>{customerSizeLabel(variant.label) ?? variant.label}</span>}<span>{variant.pricingMode === "fixed" && variant.priceCentavos != null ? `₱${(variant.priceCentavos / 100).toLocaleString("en-PH")}` : "Price to confirm"}</span></div>{(lead > 0 || dayText) && <p className="size-availability">{lead > 0 ? `Pre-order · ${lead} ${lead === 1 ? "day" : "days"} ahead` : ""}{dayText && <span>{dayText}</span>}</p>}</li>;
  })}</ul></div>;
}
