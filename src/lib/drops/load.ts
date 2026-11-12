import { manilaDate } from "../catalog/rules";
import { createServiceClient } from "../admin/supabase";
import type { StoreCatalog } from "../storefront/types";
import type { DropAddon, DropAllocation, DropCatalog, DropComponent, DropDate, DropEvent, DropOffering, DropStatus, DropStore } from "./types";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clock(value: unknown) {
  return text(value).slice(0, 5);
}

function day(value: unknown) {
  return text(value).slice(0, 10);
}

function cacheTtlMs() {
  const seconds = Number(process.env.STOREFRONT_CACHE_TTL_SECONDS ?? "86400");
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 86_400_000;
}

async function readRevision() {
  const result = await createServiceClient().from("drop_revision").select("revision").eq("id", 1).single();
  const revision = Number(result.data?.revision);
  if (result.error || !Number.isSafeInteger(revision)) throw new Error("drop revision unavailable");
  return revision;
}

export function catalogForDrops(catalog: StoreCatalog): DropCatalog {
  return {
    theme: catalog.settings.theme,
    products: catalog.products.map((product) => ({
      id: product.id,
      name: product.name,
      enabled: product.enabled,
      image: product.image,
      themeImages: product.themeImages,
      sizes: product.sizes.map((size) => ({
        id: size.id,
        label: size.label,
        enabled: size.enabled,
        image: size.image,
        themeImages: size.themeImages,
      })),
    })),
  };
}

export async function loadDrops(): Promise<DropStore> {
  const service = createServiceClient();
  const [drops, dates, offerings, components, allocations, addons] = await Promise.all([
    service.from("drops").select("id, location_id, status, name, address, map_url, delivery_enabled, updated_at").order("id"),
    service.from("drop_dates").select("drop_id, service_date, ordering_opens, ordering_cutoff, pickup_starts, pickup_ends, dispatch_starts, dispatch_ends"),
    service.from("drop_offerings").select("drop_id, id, kind, name, price_centavos, per_order_max, product_id, size_id, sort_order, contents_locked_at"),
    service.from("drop_package_components").select("drop_id, offering_id, product_id, size_id, quantity"),
    service.from("drop_offering_dates").select("drop_id, offering_id, service_date, included, allocated, committed"),
    service.from("drop_addons").select("drop_id, add_on_id, name, price_centavos, icon, sort_order"),
  ]);
  const failed = [drops, dates, offerings, components, allocations, addons].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  const revision = await readRevision();
  const rows = (drops.data ?? []) as Row[];
  return {
    revision,
    drops: rows.map((row): DropEvent => {
      const id = text(row.id);
      const status: DropStatus = row.status === "published" || row.status === "ended" ? row.status : "draft";
      return {
        id,
        locationId: text(row.location_id),
        status,
        name: text(row.name),
        address: text(row.address),
        mapUrl: text(row.map_url),
        deliveryEnabled: Boolean(row.delivery_enabled),
        updatedAt: text(row.updated_at),
        dates: ((dates.data ?? []) as Row[]).filter((date) => date.drop_id === id).map((date): DropDate => ({
          date: day(date.service_date),
          orderingOpens: clock(date.ordering_opens),
          orderingCutoff: clock(date.ordering_cutoff),
          pickupStarts: clock(date.pickup_starts),
          pickupEnds: clock(date.pickup_ends),
          dispatchStarts: date.dispatch_starts ? clock(date.dispatch_starts) : null,
          dispatchEnds: date.dispatch_ends ? clock(date.dispatch_ends) : null,
        })),
        offerings: ((offerings.data ?? []) as Row[]).filter((offering) => offering.drop_id === id).map((offering): DropOffering => ({
          id: text(offering.id),
          kind: offering.kind === "package" ? "package" : "size",
          name: text(offering.name),
          priceCentavos: Number(offering.price_centavos),
          perOrderMax: Number(offering.per_order_max),
          productId: offering.product_id ? text(offering.product_id) : null,
          sizeId: offering.size_id ? text(offering.size_id) : null,
          sortOrder: Number(offering.sort_order),
          contentsLockedAt: offering.contents_locked_at ? text(offering.contents_locked_at) : null,
          components: ((components.data ?? []) as Row[])
            .filter((component) => component.drop_id === id && component.offering_id === offering.id)
            .map((component): DropComponent => ({
              productId: text(component.product_id),
              sizeId: text(component.size_id),
              quantity: Number(component.quantity),
            }))
            .sort((left, right) => left.productId.localeCompare(right.productId) || left.sizeId.localeCompare(right.sizeId)),
          dates: ((allocations.data ?? []) as Row[])
            .filter((allocation) => allocation.drop_id === id && allocation.offering_id === offering.id)
            .map((allocation): DropAllocation => ({
              date: day(allocation.service_date),
              included: Boolean(allocation.included),
              allocated: Number(allocation.allocated),
              committed: Number(allocation.committed),
            })),
        })),
        addons: ((addons.data ?? []) as Row[]).filter((addon) => addon.drop_id === id).map((addon): DropAddon => ({
          addOnId: text(addon.add_on_id),
          name: text(addon.name),
          priceCentavos: Number(addon.price_centavos),
          icon: text(addon.icon),
          sortOrder: Number(addon.sort_order),
        })),
      };
    }),
  };
}

/** Public drop reads share one snapshot. Open, sold-out, and ended are calculated afterward. */
export async function cachedDrops(now = new Date()): Promise<DropStore> {
  const before = await readRevision();
  const service = createServiceClient();
  const snapshot = await service.from("drop_snapshot").select("revision, payload, stored_at").eq("id", 1).maybeSingle();
  if (snapshot.error) throw new Error(snapshot.error.message);
  const storedAt = snapshot.data ? Date.parse(text(snapshot.data.stored_at)) : Number.NaN;
  if (snapshot.data && snapshot.data.revision === before && now.getTime() - storedAt < cacheTtlMs()) {
    return snapshot.data.payload as DropStore;
  }
  const store = await loadDrops();
  if (store.revision === before) {
    const saved = await service.from("drop_snapshot").upsert({
      id: 1,
      revision: store.revision,
      payload: store,
      stored_at: now.toISOString(),
    });
    if (saved.error) throw new Error(saved.error.message);
  }
  return store;
}

/** Order transactions update commitments independently of the editorial drop revision. */
export async function publicDropsWithStock(now = new Date(), eventId?: string): Promise<DropStore> {
  const store = await cachedDrops(now);
  const published = store.drops.filter(drop => drop.status === "published" && (!eventId || eventId === drop.id));
  if (!published.length) return store;
  const today = manilaDate(now);
  const ids = published.map(drop => drop.id);
  const commitments = new Map<string, number>();
  const key = (drop: string, offering: string, date: string) => `${drop}/${offering}/${date}`;
  const service = createServiceClient();
  for (let start = 0; ; start += 1000) {
    const result = await service.from("drop_offering_dates").select("drop_id, offering_id, service_date, committed")
      .in("drop_id", ids).gte("service_date", today)
      .order("drop_id").order("offering_id").order("service_date").range(start, start + 999);
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data ?? []) commitments.set(key(row.drop_id, row.offering_id, row.service_date), row.committed);
    if ((result.data?.length ?? 0) < 1000) break;
  }
  return {
    ...store,
    drops: store.drops.map(drop => !ids.includes(drop.id) ? drop : {
      ...drop,
      offerings: drop.offerings.map(offering => ({
        ...offering,
        dates: offering.dates.map(allocation => ({
          ...allocation,
          committed: commitments.get(key(drop.id, offering.id, allocation.date)) ?? allocation.committed,
        })),
      })),
    }),
  };
}

export async function dropLocation(locationId: string) {
  const result = await createServiceClient().from("locations").select("id, kind").eq("id", locationId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data || result.data.kind !== "drop") return null;
  return result.data.id;
}
