import { createServiceClient } from "../admin/supabase";
import type { StoreAddOn, StoreCatalog, StoreImage, StoreLocation, StorePopup, StoreProduct, StoreSection, StoreSize, StoreThemeImage, ThemeName } from "./types";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clock(value: unknown) {
  return text(value).slice(0, 5);
}

function date(value: unknown) {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : null;
}

function image(path: unknown, alt: unknown): StoreImage | null {
  if (typeof path !== "string" || typeof alt !== "string" || !path || !alt) return null;
  return { path, alt };
}

function themeImages(rows: unknown): StoreThemeImage[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const record = row as Row;
    const theme: ThemeName | null = record.theme === "christmas" || record.theme === "original" ? record.theme : null;
    const resolved = image(record.image_path, record.image_alt);
    return theme && resolved ? [{ theme, path: resolved.path, alt: resolved.alt }] : [];
  });
}

function numbers(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function cacheTtlMs() {
  const seconds = Number(process.env.STOREFRONT_CACHE_TTL_SECONDS ?? "86400");
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 86_400_000;
}

async function readRevision() {
  const result = await createServiceClient().from("storefront_revision").select("revision").eq("id", 1).single();
  const revision = Number(result.data?.revision);
  if (result.error || !Number.isSafeInteger(revision)) throw new Error("storefront revision unavailable");
  return revision;
}

export async function loadCatalog(): Promise<StoreCatalog> {
  const service = createServiceClient();
  const [settings, locations, sections, products, addOns, schedules, overrides, featured, popups] = await Promise.all([
    service.from("shop_settings").select("theme, booking_horizon_days, preorder_lead_days, instagram_url, instagram_dm_url, messenger_url, updated_at").eq("id", 1).single(),
    service.from("locations").select("id, kind, name, address, map_url, hours_label, visible, pickup_enabled, delivery_enabled, accepting_orders, grab_food_url, foodpanda_url, updated_at").order("id"),
    service.from("menu_sections").select("id, name, note, sort_order, weekdays, updated_at").order("sort_order"),
    service.from("products").select("id, name, short_description, description, allergens, section_id, enabled, sort_order, image_path, image_alt, season_start, season_end, updated_at, product_theme_images(theme, image_path, image_alt), product_sizes(id, label, price_centavos, mode, enabled, sort_order, image_path, image_alt, size_theme_images(theme, image_path, image_alt), size_branch_assignments(location_id))").order("sort_order"),
    service.from("add_ons").select("id, name, price_centavos, icon, enabled, sort_order, updated_at, add_on_locations(location_id)").order("sort_order"),
    service.from("branch_schedules").select("location_id, enabled, opens, cutoff, weekdays, updated_at"),
    service.from("schedule_date_overrides").select("location_id, service_date, closed, opens, cutoff, updated_at"),
    service.from("featured_products").select("product_id, rank").order("rank"),
    service.from("popups").select("id, location_id, name, address, map_url, start_date, end_date, hours, items, updated_at").order("start_date"),
  ]);
  const revision = await readRevision();
  const failed = [settings, locations, sections, products, addOns, schedules, overrides, featured, popups].find((result) => result.error);
  if (failed?.error || !settings.data) throw new Error(failed?.error?.message ?? "catalog unavailable");

  return {
    revision,
    settings: {
      theme: settings.data.theme === "original" ? "original" : "christmas",
      bookingHorizonDays: settings.data.booking_horizon_days,
      preorderLeadDays: settings.data.preorder_lead_days,
      instagramUrl: settings.data.instagram_url,
      instagramDmUrl: settings.data.instagram_dm_url,
      messengerUrl: settings.data.messenger_url,
      updatedAt: settings.data.updated_at,
    },
    locations: ((locations.data ?? []) as Row[]).map((row): StoreLocation => ({
      id: text(row.id),
      kind: row.kind === "drop" ? "drop" : "regular",
      name: text(row.name),
      address: text(row.address),
      mapUrl: text(row.map_url),
      hoursLabel: text(row.hours_label),
      visible: Boolean(row.visible),
      pickupEnabled: Boolean(row.pickup_enabled),
      deliveryEnabled: Boolean(row.delivery_enabled),
      acceptingOrders: Boolean(row.accepting_orders),
      grabFoodUrl: text(row.grab_food_url),
      foodpandaUrl: text(row.foodpanda_url),
      updatedAt: text(row.updated_at),
    })),
    sections: ((sections.data ?? []) as Row[]).map((row): StoreSection => ({
      id: text(row.id),
      name: text(row.name),
      note: text(row.note),
      sortOrder: Number(row.sort_order),
      weekdays: numbers(row.weekdays),
      updatedAt: text(row.updated_at),
    })),
    products: ((products.data ?? []) as Row[]).map((row): StoreProduct => ({
      id: text(row.id),
      name: text(row.name),
      shortDescription: text(row.short_description),
      description: text(row.description),
      allergens: strings(row.allergens),
      sectionId: text(row.section_id),
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order),
      image: image(row.image_path, row.image_alt) ?? { path: text(row.image_path), alt: text(row.image_alt) },
      seasonStart: date(row.season_start),
      seasonEnd: date(row.season_end),
      themeImages: themeImages(row.product_theme_images),
      updatedAt: text(row.updated_at),
      sizes: (Array.isArray(row.product_sizes) ? row.product_sizes : []).map((size): StoreSize => {
        const record = size as Row;
        return {
          id: text(record.id),
          label: text(record.label),
          priceCentavos: Number(record.price_centavos),
          mode: record.mode === "preorder" ? "preorder" : "regular",
          enabled: Boolean(record.enabled),
          sortOrder: Number(record.sort_order),
          image: image(record.image_path, record.image_alt),
          themeImages: themeImages(record.size_theme_images),
          branchIds: (Array.isArray(record.size_branch_assignments) ? record.size_branch_assignments : []).map((assignment) => text((assignment as Row).location_id)).filter(Boolean).sort(),
        };
      }).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)),
    })),
    addOns: ((addOns.data ?? []) as Row[]).map((row): StoreAddOn => ({
      id: text(row.id),
      name: text(row.name),
      priceCentavos: Number(row.price_centavos),
      icon: text(row.icon),
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order),
      locationIds: (Array.isArray(row.add_on_locations) ? row.add_on_locations : []).map((assignment) => text((assignment as Row).location_id)).filter(Boolean).sort(),
      updatedAt: text(row.updated_at),
    })),
    schedules: ((schedules.data ?? []) as Row[]).map((row) => ({
      locationId: text(row.location_id),
      enabled: Boolean(row.enabled),
      opens: clock(row.opens),
      cutoff: clock(row.cutoff),
      weekdays: numbers(row.weekdays),
      updatedAt: text(row.updated_at),
    })),
    overrides: ((overrides.data ?? []) as Row[]).map((row) => ({
      locationId: text(row.location_id),
      date: date(row.service_date) ?? "",
      closed: Boolean(row.closed),
      opens: row.opens ? clock(row.opens) : null,
      cutoff: row.cutoff ? clock(row.cutoff) : null,
      updatedAt: text(row.updated_at),
    })),
    featuredIds: ((featured.data ?? []) as Row[]).map((row) => text(row.product_id)),
    popups: ((popups.data ?? []) as Row[]).map((row): StorePopup => ({
      id: text(row.id),
      locationId: text(row.location_id),
      name: text(row.name),
      address: text(row.address),
      mapUrl: text(row.map_url),
      startDate: date(row.start_date) ?? "",
      endDate: date(row.end_date) ?? "",
      hours: text(row.hours),
      items: strings(row.items),
      updatedAt: text(row.updated_at),
    })),
  };
}

/** Public reads share one database snapshot. Eligibility is calculated after this returns. */
export async function cachedCatalog(now = new Date()): Promise<StoreCatalog> {
  const before = await readRevision();
  const service = createServiceClient();
  const snapshot = await service.from("storefront_snapshot").select("revision, payload, stored_at").eq("id", 1).maybeSingle();
  if (snapshot.error) throw new Error(snapshot.error.message);
  const storedAt = snapshot.data ? Date.parse(text(snapshot.data.stored_at)) : Number.NaN;
  if (snapshot.data && snapshot.data.revision === before && now.getTime() - storedAt < cacheTtlMs()) {
    return snapshot.data.payload as StoreCatalog;
  }
  const catalog = await loadCatalog();
  if (catalog.revision === before) {
    const saved = await service.from("storefront_snapshot").upsert({
      id: 1,
      revision: catalog.revision,
      payload: catalog,
      stored_at: now.toISOString(),
    });
    if (saved.error) throw new Error(saved.error.message);
  }
  return catalog;
}

export function isTheme(value: string | null): value is ThemeName {
  return value === "christmas" || value === "original";
}
