import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { POST as signIn } from "../src/app/api/admin/session/route";
import { GET as adminCatalogGet, POST as adminCatalogPost } from "../src/app/api/admin/catalog/route";
import { GET as previewGet } from "../src/app/api/admin/preview/route";
import { GET as eligibilityGet } from "../src/app/api/public/eligibility/route";
import { GET as shopGet } from "../src/app/api/public/shop/route";
import { REFRESH_COOKIE } from "../src/lib/admin/session";
import { createServiceClient } from "../src/lib/admin/supabase";
import { applyCatalogChange, parseCatalogChange } from "../src/lib/storefront/change";
import { loadCatalog } from "../src/lib/storefront/load";
import type { StoreCatalog, StoreProduct } from "../src/lib/storefront/types";

const service = createServiceClient();

function productPayload(catalog: StoreCatalog, product: StoreProduct, patch: Record<string, unknown> = {}) {
  return {
    revision: catalog.revision,
    id: product.id,
    updatedAt: product.updatedAt,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    allergens: product.allergens,
    sectionId: product.sectionId,
    enabled: product.enabled,
    sortOrder: product.sortOrder,
    imagePath: product.image.path,
    imageAlt: product.image.alt,
    seasonStart: product.seasonStart,
    seasonEnd: product.seasonEnd,
    themeImages: product.themeImages,
    sizes: product.sizes.map((size) => ({
      id: size.id,
      label: size.label,
      priceCentavos: size.priceCentavos,
      mode: size.mode,
      enabled: size.enabled,
      sortOrder: size.sortOrder,
      imagePath: size.image?.path ?? null,
      imageAlt: size.image?.alt ?? null,
      themeImages: size.themeImages,
      branchIds: size.branchIds,
    })),
    ...patch,
  };
}

function request(path: string, options: { method?: string; cookie?: string | null; origin?: string | null; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? "http://127.0.0.1:3000");
  if (options.cookie) headers.set("cookie", `${REFRESH_COOKIE}=${encodeURIComponent(options.cookie)}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function refreshCookie(response: Response) {
  const match = (response.headers.get("set-cookie") ?? "").match(new RegExp(`${REFRESH_COOKIE}=([^;]*)`));
  return match && match[1] !== "" ? decodeURIComponent(match[1]) : null;
}

async function menuProduct(id: string) {
  const response = await shopGet();
  assert.equal(response.status, 200);
  const body = await response.json();
  const products = body.menu.flatMap((section: { products: { id: string; name: string; sizes: { id: string; image: { path: string } }[] }[] }) => section.products);
  return { body, product: products.find((item: { id: string }) => item.id === id) };
}

test("public shop resolves seed images, featured pies, and the Sunday Market", async () => {
  const { body, product } = await menuProduct("keylime");
  assert.equal(body.theme, "christmas");
  assert.equal(body.preview, false);
  assert.equal(product.sizes.find((size: { id: string }) => size.id === "4-inch").image.path, "/images/christmas/keylime.webp");
  assert.equal(product.sizes.find((size: { id: string }) => size.id === "10-inch").image.path, "/images/brand/keylime-10.webp");
  assert.equal(body.menu.some((section: { products: { id: string }[] }) => section.products.some((item) => item.id === "pumpkin-spice")), false);
  assert.deepEqual(body.featured, ["buko", "smores", "pecan", "keylime"]);
  assert.equal(body.popups[0].id, "sunday-market");

  const eligibility = await eligibilityGet(request("/api/public/eligibility?location=cebu"));
  assert.equal(eligibility.status, 200);
  const dates = await eligibility.json();
  assert.equal(dates.locationId, "cebu");
  assert.ok(dates.dates.length > 0);
  const hidden = await eligibilityGet(request("/api/public/eligibility?location=manila"));
  assert.equal(hidden.status, 404);
});

test("anonymous catalog writes are refused and a save shows up on the next public read", async () => {
  const anonymous = await adminCatalogPost(request("/api/admin/catalog", { method: "POST", body: { action: "save_featured", payload: { revision: 1, productIds: [] } } }));
  assert.equal(anonymous.status, 401);
  const forged = await adminCatalogPost(request("/api/admin/catalog", { method: "POST", origin: null, body: {} }));
  assert.equal(forged.status, 403);

  const before = await loadCatalog();
  const keylime = before.products.find((item) => item.id === "keylime");
  assert.ok(keylime);
  const email = `phase2-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, password: "correct-horse", email_confirm: true });
  assert.equal(created.error, null);
  const userId = created.data.user?.id;
  assert.ok(userId);
  try {
    await service.from("admin_users").insert({ user_id: userId });
    const signedIn = await signIn(request("/api/admin/session", {
      method: "POST",
      body: { email, password: "correct-horse" },
    }));
    assert.equal(signedIn.status, 200);
    const cookie = refreshCookie(signedIn);
    assert.ok(cookie);
    const saved = await adminCatalogPost(request("/api/admin/catalog", {
      method: "POST",
      cookie,
      body: { action: "save_product", payload: productPayload(before, keylime, { shortDescription: "Saved from the owner route." }) },
    }));
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.deepEqual(savedBody.affectedOrders, []);
    const shown = await menuProduct("keylime");
    assert.equal(shown.product.shortDescription, "Saved from the owner route.");
    const fresh = await adminCatalogGet(request("/api/admin/catalog", { cookie: refreshCookie(saved) ?? cookie }));
    assert.equal(fresh.status, 200);
    const freshBody = await fresh.json();
    assert.equal(freshBody.products.find((item: { id: string }) => item.id === "keylime").shortDescription, "Saved from the owner route.");

    const preview = await previewGet(request("/api/admin/preview?theme=original", { cookie: refreshCookie(saved) ?? cookie }));
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.preview, true);
    assert.equal(previewBody.theme, "original");
    assert.equal(previewBody.locations.every((location: { acceptingOrders: boolean }) => location.acceptingOrders === false), true);
    const fourInch = previewBody.menu.flatMap((section: { products: { id: string; sizes: { id: string; image: { path: string } }[] }[] }) => section.products).find((item: { id: string }) => item.id === "keylime");
    assert.equal(fourInch.sizes.find((size: { id: string }) => size.id === "4-inch").image.path, "/images/brand/keylime.webp");
    const published = await loadCatalog();
    assert.equal(published.settings.theme, "christmas");
    const live = await menuProduct("keylime");
    assert.equal(live.body.theme, "christmas");
    assert.equal(live.product.sizes.find((size: { id: string }) => size.id === "4-inch").image.path, "/images/christmas/keylime.webp");

    const rankingResponse = await adminCatalogPost(request("/api/admin/catalog", {
      method: "POST",
      cookie: refreshCookie(preview) ?? refreshCookie(fresh) ?? refreshCookie(saved) ?? cookie,
      body: { action: "save_featured", payload: { revision: published.revision, productIds: published.featuredIds } },
    }));
    assert.equal(rankingResponse.status, 200, JSON.stringify(await rankingResponse.json()));
    assert.deepEqual((await loadCatalog()).featuredIds, published.featuredIds);
  } finally {
    const current = await loadCatalog();
    const currentKeylime = current.products.find((item) => item.id === "keylime");
    if (currentKeylime && currentKeylime.shortDescription !== keylime.shortDescription) {
      await applyCatalogChange("save_product", productPayload(current, currentKeylime, { shortDescription: keylime.shortDescription }));
    }
    await service.from("admin_users").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
});

test("stale saves, unknown images, hidden Cebu, and busy sections are rejected", async () => {
  const before = await loadCatalog();
  const keylime = before.products.find((item) => item.id === "keylime");
  const cebu = before.locations.find((item) => item.id === "cebu");
  const classic = before.sections.find((item) => item.id === "classic-flavors");
  assert.ok(keylime && cebu && classic);
  const renamed = await applyCatalogChange("save_product", productPayload(before, keylime, { name: "Keylime A" }));
  assert.equal(renamed.status, 200);
  try {
    const stale = await applyCatalogChange("save_product", productPayload(before, keylime, { name: "Keylime B" }));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "stale_save");
    const current = await loadCatalog();
    assert.equal(current.products.find((item) => item.id === "keylime")?.name, "Keylime A");

    const unknown = await applyCatalogChange("save_product", productPayload(current, current.products.find((item) => item.id === "keylime") as StoreProduct, { imagePath: "/images/brand/missing.webp" }));
    assert.equal(unknown.status, 400);
    assert.equal((await loadCatalog()).products.find((item) => item.id === "keylime")?.image.path, keylime.image.path);

    const hidden = await applyCatalogChange("save_location", {
      revision: current.revision,
      ...cebu,
      visible: false,
    });
    assert.equal(hidden.status, 400);
    assert.equal((await loadCatalog()).locations.find((item) => item.id === "cebu")?.visible, true);

    const busy = await applyCatalogChange("delete_section", { revision: (await loadCatalog()).revision, id: classic.id, updatedAt: classic.updatedAt });
    assert.equal(busy.status, 409);
    assert.equal(busy.body.error, "section_in_use");
  } finally {
    const current = await loadCatalog();
    const currentKeylime = current.products.find((item) => item.id === "keylime");
    if (currentKeylime && currentKeylime.name !== keylime.name) {
      await applyCatalogChange("save_product", productPayload(current, currentKeylime, { name: keylime.name }));
    }
  }
});

test("a new regular branch gets hours, and a date change reports no orders", async () => {
  const before = await loadCatalog();
  const created = await applyCatalogChange("save_location", {
    revision: before.revision,
    id: "phase2-branch",
    kind: "regular",
    name: "Phase 2",
    address: "",
    mapUrl: "",
    hoursLabel: "",
    visible: false,
    pickupEnabled: true,
    deliveryEnabled: false,
    acceptingOrders: false,
    grabFoodUrl: "",
    foodpandaUrl: "",
  });
  assert.equal(created.status, 200);
  try {
    const withBranch = await loadCatalog();
    const schedule = withBranch.schedules.find((item) => item.locationId === "phase2-branch");
    assert.equal(schedule?.opens, "10:00");
    assert.equal(schedule?.cutoff, "19:00");
    const closed = await applyCatalogChange("save_override", {
      revision: withBranch.revision,
      locationId: "cebu",
      date: "2026-12-24",
      closed: true,
      opens: null,
      cutoff: null,
    });
    assert.equal(closed.status, 200);
    assert.deepEqual(closed.body.affectedOrders, []);
    const override = (await loadCatalog()).overrides.find((item) => item.date === "2026-12-24");
    assert.equal(override?.closed, true);
    const removed = await applyCatalogChange("delete_override", {
      revision: (await loadCatalog()).revision,
      locationId: "cebu",
      date: "2026-12-24",
      updatedAt: override?.updatedAt,
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.affectedOrders, []);
  } finally {
    await service.from("branch_schedules").delete().eq("location_id", "phase2-branch");
    await service.from("schedule_date_overrides").delete().eq("location_id", "cebu").eq("service_date", "2026-12-24");
    await service.from("locations").delete().eq("id", "phase2-branch");
  }
});

test("admin catalog and preview require an owner", async () => {
  const anonymous = await adminCatalogGet(request("/api/admin/catalog"));
  assert.equal(anonymous.status, 401);
  const openPreview = await previewGet(request("/api/admin/preview?theme=original"));
  assert.equal(openPreview.status, 401);
});

test("all Storefront tabs save through the catalog contract inside a rolled-back transaction", async () => {
  const catalog = await loadCatalog();
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    await db.query("begin");
    const revisionResult = await db.query("select revision from public.storefront_revision where id = 1 for update");
    let revision = Number(revisionResult.rows[0].revision);
    async function save(action: string, fields: Record<string, unknown>) {
      const change = parseCatalogChange(action, { ...fields, revision });
      assert.ok(change);
      const result = await db.query("select public.apply_catalog_change($1, $2::jsonb) as result", [change.action, JSON.stringify(change.payload)]);
      revision = result.rows[0].result.revision;
    }

    const theme = catalog.settings.theme === "christmas" ? "original" : "christmas";
    await save("save_settings", { ...catalog.settings, theme });
    const version = await db.query("select updated_at::text as updated_at from public.shop_settings where id = 1");
    const instagramUrl = "https://example.com/phase5-preview";
    await save("save_settings", { ...catalog.settings, theme, updatedAt: version.rows[0].updated_at, instagramUrl });
    const settings = await db.query("select theme, instagram_url, messenger_url from public.shop_settings where id = 1");
    assert.deepEqual(settings.rows[0], { theme, instagram_url: instagramUrl, messenger_url: catalog.settings.messengerUrl });

    await save("save_featured", { productIds: ["pecan", "keylime"] });
    const ranking = await db.query("select product_id from public.featured_products order by rank");
    assert.deepEqual(ranking.rows.map(row => row.product_id), ["pecan", "keylime"]);

    const id = "storefront-" + randomUUID();
    await save("save_section", { id, name: "New section", note: "Regular sizes", weekdays: [1, 3], sortOrder: 9999 });
    const sections = await db.query("select id, updated_at::text as version from public.menu_sections order by sort_order desc, id");
    await save("reorder_sections", { items: sections.rows.map(row => ({ id: row.id, updatedAt: row.version })) });
    const section = await db.query("select note, weekdays, sort_order from public.menu_sections where id = $1", [id]);
    assert.deepEqual(section.rows[0], { note: "Regular sizes", weekdays: [1, 3], sort_order: 0 });

    await save("save_popup", { id, locationId: "cebu", name: "Informational pop-up", address: "Cebu", mapUrl: "",
      startDate: "2020-01-01", endDate: "2020-01-02", hours: "10am to noon", items: ["Pies"] });
    const popup = await db.query("select name, end_date::text as ends, items from public.popups where id = $1", [id]);
    assert.deepEqual(popup.rows[0], { name: "Informational pop-up", ends: "2020-01-02", items: ["Pies"] });
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
