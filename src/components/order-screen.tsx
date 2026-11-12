import { Checkout, type CheckoutLocation } from "@/components/checkout/checkout";
import { SiteShell } from "@/components/site-shell";
import { publicDropsWithStock, catalogForDrops } from "@/lib/drops/load";
import { presentDrop, presentDropDiscovery } from "@/lib/drops/present";
import { cachedCatalog } from "@/lib/storefront/load";
import { presentEligibility, presentShop } from "@/lib/storefront/present";

export type OrderSearch = { loc?: string | string[]; drop?: string | string[]; product?: string | string[]; size?: string | string[] };

export async function OrderScreen({ searchParams }: { searchParams: Promise<OrderSearch> }) {
  const params = await searchParams;
  const [catalogResult, dropsResult] = await Promise.allSettled([cachedCatalog(), publicDropsWithStock()]);
  const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : undefined;
  const store = dropsResult.status === "fulfilled" ? dropsResult.value : undefined;
  const now = new Date();
  const shop = catalog ? presentShop(catalog, now) : undefined;
  const dropCatalog = catalog ? catalogForDrops(catalog) : undefined;
  const drops = store && catalog && dropCatalog ? presentDropDiscovery(store, catalog.locations, dropCatalog, now) : [];
  const requested = typeof params.loc === "string" ? params.loc : "cebu";
  const rawDrop = typeof params.drop === "string" ? params.drop : undefined;
  const requestedDrop = rawDrop ? store?.drops.find(drop => drop.id === rawDrop && drop.locationId === requested) : undefined;
  const direct = requestedDrop && dropCatalog ? presentDrop(requestedDrop, dropCatalog, now) : undefined;
  const locations: CheckoutLocation[] = (shop?.locations ?? []).filter(item => item.kind === "regular")
    .map(item => ({ id: item.id, name: item.name, kind: "regular" }));
  for (const drop of drops) {
    if (!locations.some(location => location.id === drop.locationId)) {
      locations.push({ id: drop.locationId, name: drop.city, kind: "drop" });
    }
  }
  const cebu = locations.findIndex(location => location.id === "cebu");
  if (cebu < 0) locations.unshift({ id: "cebu", name: "Cebu", kind: "regular" });
  else if (cebu > 0) locations.unshift(...locations.splice(cebu, 1));

  const validLocation = locations.some(location => location.id === requested) || direct?.status === "ended";
  const discoveryFailed = !catalog || !store;
  const locationId = validLocation ? requested : "cebu";
  const events = drops.filter(drop => drop.locationId === locationId);
  const eventId = direct?.id ?? (events.length === 1 ? events[0].id : undefined);
  const event = eventId && dropCatalog ? store?.drops.find(drop => drop.id === eventId) : undefined;
  const drop = event && dropCatalog ? presentDrop(event, dropCatalog, now) : undefined;
  const branch = shop?.locations.find(location => location.id === locationId && location.kind === "regular");
  let notice: string | undefined;
  if ((!validLocation || Array.isArray(params.loc)) && !discoveryFailed) notice = "That location is unavailable. Showing Cebu orders.";
  else if (params.drop !== undefined && !direct && !discoveryFailed) notice = "That drop is unavailable. Choose an event or order from Cebu.";
  else if (discoveryFailed) notice = "Some ordering information could not be loaded. Refresh to check again.";

  return <SiteShell showFooterCta={false} mobileCheckout>
    <Checkout key={locationId + ":" + (drop?.id ?? "")} locations={locations} locationId={locationId}
      events={events} shop={shop} drop={drop ?? undefined} notice={notice}
      eligibility={catalog && branch ? presentEligibility(catalog, branch.id, now) ?? undefined : undefined}
      requestedProduct={typeof params.product === "string" ? params.product : undefined}
      requestedSize={typeof params.size === "string" ? params.size : undefined} />
  </SiteShell>;
}
