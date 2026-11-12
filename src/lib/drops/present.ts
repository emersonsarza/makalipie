import { manilaDate } from "../catalog/rules";
import { resolveSizeImage } from "../storefront/images";
import type { StoreCatalog, StoreImage } from "../storefront/types";
import type { DropCatalog, DropDate, DropEvent, DropOffering, DropStore } from "./types";

function atManila(date: string, time: string) {
  return Date.parse(`${date}T${time.slice(0, 5)}:00+08:00`);
}

export function effectiveStatus(drop: { status: DropEvent["status"]; dates: Pick<DropDate, "date" | "pickupEnds" | "dispatchEnds">[] }, now: Date) {
  if (drop.status !== "published") return drop.status;
  const latest = drop.dates.reduce((end, date) => {
    const pickup = atManila(date.date, date.pickupEnds);
    const dispatch = date.dispatchEnds ? atManila(date.date, date.dispatchEnds) : pickup;
    return Math.max(end, pickup, dispatch);
  }, Number.NEGATIVE_INFINITY);
  return now.getTime() >= latest ? "ended" : "published";
}

function orderingOpen(date: DropDate, now: Date) {
  if (date.date !== manilaDate(now)) return false;
  const instant = now.getTime();
  return instant >= atManila(date.date, date.orderingOpens) && instant < atManila(date.date, date.orderingCutoff);
}

function sizeRecord(catalog: DropCatalog, productId: string, sizeId: string) {
  const product = catalog.products.find((item) => item.id === productId);
  const size = product?.sizes.find((item) => item.id === sizeId);
  return { product, size, enabled: Boolean(product?.enabled && size?.enabled) };
}

function sizeImage(catalog: DropCatalog, productId: string, sizeId: string): StoreImage {
  const { product, size } = sizeRecord(catalog, productId, sizeId);
  return resolveSizeImage({
    theme: catalog.theme,
    sizeImage: size?.image ?? null,
    themeImages: size?.themeImages ?? [],
    productImage: product?.image ?? null,
  });
}

function offeringOrderable(catalog: DropCatalog, offering: DropOffering, allocation: DropOffering["dates"][number], open: boolean, preview: boolean) {
  if (preview || !open || !allocation.included || allocation.allocated - allocation.committed <= 0) return false;
  if (offering.kind === "size") return sizeRecord(catalog, offering.productId ?? "", offering.sizeId ?? "").enabled;
  return offering.components.every((component) => sizeRecord(catalog, component.productId, component.sizeId).enabled);
}

export function presentDrop(drop: DropEvent, catalog: DropCatalog, now = new Date(), options?: { preview?: boolean }) {
  const preview = Boolean(options?.preview);
  const status = preview ? drop.status : effectiveStatus(drop, now);
  if (!preview && status === "draft") return null;
  return {
    id: drop.id,
    today: manilaDate(now),
    locationId: drop.locationId,
    status,
    preview,
    name: drop.name,
    address: drop.address,
    mapUrl: drop.mapUrl,
    deliveryEnabled: drop.deliveryEnabled,
    dates: [...drop.dates].sort((left, right) => left.date.localeCompare(right.date)).map((date) => {
      const open = !preview && status === "published" && orderingOpen(date, now);
      return {
        date: date.date,
        orderingOpens: date.orderingOpens,
        orderingCutoff: date.orderingCutoff,
        pickup: { starts: date.pickupStarts, ends: date.pickupEnds },
        dispatch: date.dispatchStarts && date.dispatchEnds ? { starts: date.dispatchStarts, ends: date.dispatchEnds } : null,
        orderingOpen: open,
        offerings: [...drop.offerings].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)).flatMap((offering) => {
          const allocation = offering.dates.find((item) => item.date === date.date);
          if (!allocation?.included) return [];
          const images = offering.kind === "package"
            ? offering.components.map((component) => sizeImage(catalog, component.productId, component.sizeId))
            : [sizeImage(catalog, offering.productId ?? "", offering.sizeId ?? "")];
          return [{
            id: offering.id,
            kind: offering.kind,
            name: offering.name,
            priceCentavos: offering.priceCentavos,
            perOrderMax: offering.perOrderMax,
            productId: offering.productId,
            sizeId: offering.sizeId,
            components: offering.components.map(component => {
              const { product, size } = sizeRecord(catalog, component.productId, component.sizeId);
              return { ...component, name: product?.name ?? component.productId, sizeLabel: size?.label ?? component.sizeId };
            }),
            sizeLabel: offering.kind === "size" ? sizeRecord(catalog, offering.productId ?? "", offering.sizeId ?? "").size?.label : undefined,
            included: true,
            allocated: allocation.allocated,
            committed: allocation.committed,
            remaining: allocation.allocated - allocation.committed,
            orderable: offeringOrderable(catalog, offering, allocation, open, preview),
            images,
          }];
        }),
      };
    }),
    addons: [...drop.addons].sort((left, right) => left.sortOrder - right.sortOrder || left.addOnId.localeCompare(right.addOnId)).map((addon) => ({
      addOnId: addon.addOnId,
      name: addon.name,
      priceCentavos: addon.priceCentavos,
      icon: addon.icon,
      sortOrder: addon.sortOrder,
    })),
  };
}

export function presentDropList(store: DropStore, locationId: string, now = new Date()) {
  return {
    locationId,
    drops: store.drops
      .filter((drop) => drop.locationId === locationId && effectiveStatus(drop, now) === "published")
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((drop) => ({
        id: drop.id,
        name: drop.name,
        address: drop.address,
        mapUrl: drop.mapUrl,
        deliveryEnabled: drop.deliveryEnabled,
        status: "published" as const,
        dates: drop.dates.map((date) => date.date).sort(),
      })),
  };
}

export function presentDropDiscovery(store: DropStore, locations: StoreCatalog["locations"], catalog: DropCatalog, now = new Date()) {
  const today = manilaDate(now);
  const cities = new Map(locations.filter(location => location.kind === "drop").map(location => [location.id, location.name]));
  return store.drops.flatMap(drop => {
    const city = cities.get(drop.locationId);
    if (!city || effectiveStatus(drop, now) !== "published") return [];
    const dates = [...drop.dates].sort((left, right) => left.date.localeCompare(right.date));
    const upcoming = dates.filter(date => Math.max(atManila(date.date, date.pickupEnds),
      date.dispatchEnds ? atManila(date.date, date.dispatchEnds) : 0) > now.getTime());
    const nextDate = upcoming[0]?.date;
    if (!nextDate) return [];
    const current = dates.find(date => date.date === today);
    let ordering: "upcoming" | "open" | "sold_out" | "closed" = "upcoming";
    if (current && now.getTime() >= atManila(today, current.orderingOpens)) {
      if (!orderingOpen(current, now)) ordering = "closed";
      else {
        const offerings = drop.offerings.flatMap(offering => {
          const allocation = offering.dates.find(date => date.date === today && date.included);
          return allocation ? [{ offering, allocation }] : [];
        });
        ordering = offerings.some(({ offering, allocation }) => offeringOrderable(catalog, offering, allocation, true, false))
          ? "open" : offerings.length > 0 && offerings.every(({ allocation }) => allocation.allocated <= allocation.committed)
            ? "sold_out" : "closed";
      }
    }
    return [{
      id: drop.id, locationId: drop.locationId, city, name: drop.name, address: drop.address,
      mapUrl: drop.mapUrl, deliveryEnabled: drop.deliveryEnabled, nextDate,
      dates: upcoming.map(date => date.date), ordering,
    }];
  }).sort((left, right) => left.nextDate.localeCompare(right.nextDate) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
