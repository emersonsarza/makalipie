import type { MenuItem } from "@/lib/site";
import { availabilityText } from "@/lib/catalog/rules";
export function CatalogDetails({ item }: { item: MenuItem }) {
  return <div className="public-catalog-details">{!!item.variants?.length && <ul>{item.variants.map((v) => <li key={v.id}><span>{v.label}</span><span>{v.pricingMode === "fixed" ? `₱${(v.priceCentavos! / 100).toLocaleString("en-PH")}` : "DM for price"}{v.minLeadDays > 0 && <small> · {v.minLeadDays} days preparation</small>}</span></li>)}</ul>}<p>{availabilityText({ availableWeekdays: item.availableWeekdays ?? [], unavailableDates: item.unavailableDates ?? [] })}. Choose your date in the order form to check availability.</p></div>;
}
