import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { POST as signIn } from "../src/app/api/admin/session/route";
import { GET as previewGet } from "../src/app/api/admin/drops/preview/route";
import { POST as adminDropsPost } from "../src/app/api/admin/drops/route";
import { GET as dropGet } from "../src/app/api/public/drops/[slug]/route";
import { GET as dropsGet } from "../src/app/api/public/drops/route";
import { REFRESH_COOKIE } from "../src/lib/admin/session";
import { createServiceClient } from "../src/lib/admin/supabase";
import { applyDropChange } from "../src/lib/drops/change";
import { loadDrops } from "../src/lib/drops/load";
import { presentDrop, presentDropList } from "../src/lib/drops/present";
import type { DropCatalog, DropEvent } from "../src/lib/drops/types";

const service = createServiceClient();
const ids = ["phase3-market", "phase3-copy", "phase3-cebu", "phase3-bad"];

const catalog: DropCatalog = {
  theme: "christmas",
  products: [
    {
      id: "keylime",
      enabled: true,
      image: { path: "/images/brand/keylime.webp", alt: "Keylime" },
      themeImages: [],
      sizes: [{
        id: "4-inch",
        enabled: true,
        image: null,
        themeImages: [{ theme: "christmas", path: "/images/christmas/keylime.webp", alt: "Christmas Keylime" }],
      }],
    },
    {
      id: "pecan",
      enabled: true,
      image: { path: "/images/brand/pecan.webp", alt: "Pecan" },
      themeImages: [],
      sizes: [{ id: "4-inch", enabled: true, image: { path: "/images/brand/pecan.webp", alt: "Pecan" }, themeImages: [] }],
    },
  ],
};

function sampleDrop(patch: Partial<DropEvent> = {}): DropEvent {
  return {
    id: "phase3-market",
    locationId: "manila",
    status: "published",
    name: "Manila Market",
    address: "Ayala Avenue, Makati",
    mapUrl: "",
    deliveryEnabled: false,
    updatedAt: "2026-11-11T00:00:00.000Z",
    dates: [
      { date: "2026-11-20", orderingOpens: "10:00", orderingCutoff: "14:00", pickupStarts: "10:00", pickupEnds: "15:00", dispatchStarts: null, dispatchEnds: null },
      { date: "2026-11-21", orderingOpens: "10:00", orderingCutoff: "14:00", pickupStarts: "10:00", pickupEnds: "15:00", dispatchStarts: null, dispatchEnds: null },
    ],
    offerings: [
      {
        id: "keylime-4", kind: "size", name: "Keylime", priceCentavos: 24000, perOrderMax: 4,
        productId: "keylime", sizeId: "4-inch", sortOrder: 0, contentsLockedAt: null, components: [],
        dates: [
          { date: "2026-11-20", included: true, allocated: 0, committed: 0 },
          { date: "2026-11-21", included: true, allocated: 5, committed: 0 },
        ],
      },
      {
        id: "box", kind: "package", name: "Box of four", priceCentavos: 86000, perOrderMax: 2,
        productId: null, sizeId: null, sortOrder: 1, contentsLockedAt: null,
        components: [
          { productId: "keylime", sizeId: "4-inch", quantity: 2 },
          { productId: "pecan", sizeId: "4-inch", quantity: 2 },
        ],
        dates: [
          { date: "2026-11-20", included: true, allocated: 10, committed: 0 },
          { date: "2026-11-21", included: false, allocated: 10, committed: 0 },
        ],
      },
    ],
    addons: [],
    ...patch,
  };
}

function payload(revision: number, patch: Record<string, unknown> = {}) {
  return {
    revision,
    id: "phase3-market",
    locationId: "manila",
    name: "Manila Market",
    address: "Ayala Avenue, Makati",
    mapUrl: "",
    deliveryEnabled: false,
    dates: [
      { date: "2026-11-20", orderingOpens: "10:00", orderingCutoff: "14:00", pickupStarts: "10:00", pickupEnds: "15:00", dispatchStarts: null, dispatchEnds: null },
      { date: "2026-11-21", orderingOpens: "10:00", orderingCutoff: "14:00", pickupStarts: "10:00", pickupEnds: "15:00", dispatchStarts: null, dispatchEnds: null },
    ],
    offerings: [
      {
        id: "keylime-4", kind: "size", name: "Keylime", priceCentavos: 24000, perOrderMax: 4,
        productId: "keylime", sizeId: "4-inch", sortOrder: 0, components: [], dates: [],
      },
      {
        id: "box", kind: "package", name: "Box of four", priceCentavos: 86000, perOrderMax: 2,
        productId: null, sizeId: null, sortOrder: 1,
        components: [
          { productId: "keylime", sizeId: "4-inch", quantity: 2 },
          { productId: "pecan", sizeId: "4-inch", quantity: 2 },
        ],
        dates: [],
      },
    ],
    addons: [{ addOnId: "birthday-topper", priceCentavos: 800, sortOrder: 0 }],
    ...patch,
  };
}

function covered(revision: number, updatedAt: string, allocated = 8) {
  const base = payload(revision, { updatedAt });
  const dates = [
    { date: "2026-11-20", included: true, allocated },
    { date: "2026-11-21", included: true, allocated },
  ];
  return {
    ...base,
    offerings: (base.offerings as { dates: unknown[] }[]).map((offering) => ({ ...offering, dates })),
  };
}

function request(path: string, options: { method?: string; cookie?: string | null; origin?: string | null; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? "http://127.0.0.1:3000");
  headers.set("x-forwarded-for", "203.0.113.90");
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

test("same-day ordering, sold-out dates, package images, and automatic end", () => {
  const drop = sampleDrop();
  const open = presentDrop(drop, catalog, new Date("2026-11-20T02:30:00.000Z"));
  assert.equal(open?.status, "published");
  assert.equal(open?.dates[0].orderingOpen, true);
  assert.equal(open?.dates[0].offerings.find((item) => item.id === "keylime-4")?.orderable, false);
  assert.equal(open?.dates[0].offerings.find((item) => item.id === "keylime-4")?.remaining, 0);
  assert.equal(open?.dates[0].offerings.find((item) => item.id === "box")?.orderable, true);
  assert.equal(open?.dates[0].offerings.find((item) => item.id === "box")?.committed, 0);
  assert.equal(open?.dates[0].offerings.find((item) => item.id === "box")?.images[0].path, "/images/christmas/keylime.webp");
  assert.equal(open?.dates[1].orderingOpen, false);
  assert.equal(open?.dates[1].offerings.some((item) => item.id === "box"), false);

  const beforeOpen = presentDrop(drop, catalog, new Date("2026-11-20T01:59:00.000Z"));
  assert.equal(beforeOpen?.dates[0].orderingOpen, false);
  const atCutoff = presentDrop(drop, catalog, new Date("2026-11-20T06:00:00.000Z"));
  assert.equal(atCutoff?.dates[0].orderingOpen, false);
  const disabled = presentDrop(drop, {
    ...catalog,
    products: catalog.products.map((product) => product.id === "keylime" ? { ...product, enabled: false } : product),
  }, new Date("2026-11-20T02:30:00.000Z"));
  assert.equal(disabled?.dates[0].offerings.find((item) => item.id === "box")?.orderable, false);

  const ended = presentDrop(drop, catalog, new Date("2026-11-21T07:00:00.000Z"));
  assert.equal(ended?.status, "ended");
  assert.equal(presentDropList({ revision: 1, drops: [drop, sampleDrop({ id: "draft", status: "draft" })] }, "manila", new Date("2026-11-20T02:30:00.000Z")).drops.map((item) => item.id).includes("draft"), false);
  assert.deepEqual(presentDropList({ revision: 1, drops: [drop] }, "manila", new Date("2026-11-21T07:00:00.000Z")).drops, []);
  assert.equal(presentDrop(sampleDrop({ status: "draft" }), catalog, new Date("2026-11-20T02:30:00.000Z")), null);
});

test("owner setup stays hidden until publish, and a direct ended link remains", async () => {
  const anonymous = await adminDropsPost(request("/api/admin/drops", { method: "POST", body: { action: "save_drop", payload: payload(1) } }));
  assert.equal(anonymous.status, 401);
  const price = await service.from("product_sizes").select("price_centavos").eq("product_id", "keylime").eq("id", "4-inch").single();
  assert.equal(price.error, null);
  const originalPrice = price.data.price_centavos;
  const email = `phase3-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, password: "correct-horse", email_confirm: true });
  const userId = created.data.user?.id;
  assert.ok(userId);
  try {
    await service.from("admin_users").insert({ user_id: userId });
    let store = await loadDrops();
    const wrongCity = await applyDropChange("save_drop", payload(store.revision, { id: "phase3-cebu", locationId: "cebu" }));
    assert.equal(wrongCity.status, 400);
    const shortBox = await applyDropChange("save_drop", payload(store.revision, {
      id: "phase3-bad",
      offerings: [{
        id: "box", kind: "package", name: "Short box", priceCentavos: 1000, perOrderMax: 1,
        productId: null, sizeId: null, sortOrder: 0,
        components: [{ productId: "keylime", sizeId: "4-inch", quantity: 3 }],
        dates: [],
      }],
    }));
    assert.equal(shortBox.status, 400);

    store = await loadDrops();
    const draft = await applyDropChange("save_drop", payload(store.revision));
    assert.equal(draft.status, 200);
    store = await loadDrops();
    const saved = store.drops.find((item) => item.id === "phase3-market");
    assert.equal(saved?.status, "draft");
    assert.equal(saved?.addons[0].name, "Birthday Topper");
    assert.equal(saved?.addons[0].priceCentavos, 800);
    const tooSoon = await applyDropChange("publish_drop", { revision: store.revision, id: "phase3-market", updatedAt: saved?.updatedAt });
    assert.equal(tooSoon.status, 400);

    const hidden = await dropGet(request("/api/public/drops/phase3-market"));
    assert.equal(hidden.status, 404);
    const signedIn = await signIn(request("/api/admin/session", { method: "POST", body: { email, password: "correct-horse" } }));
    assert.equal(signedIn.status, 200);
    const cookie = refreshCookie(signedIn);
    assert.ok(cookie);
    const preview = await previewGet(request("/api/admin/drops/preview?slug=phase3-market", { cookie }));
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.preview, true);
    assert.equal(previewBody.status, "draft");
    const stillHidden = await dropsGet(request("/api/public/drops?location=manila"));
    assert.equal(stillHidden.status, 200);
    assert.equal((await stillHidden.json()).drops.some((item: { id: string }) => item.id === "phase3-market"), false);

    store = await loadDrops();
    const current = store.drops.find((item) => item.id === "phase3-market");
    assert.ok(current);
    const ready = await applyDropChange("save_drop", covered(store.revision, current.updatedAt));
    assert.equal(ready.status, 200);
    store = await loadDrops();
    const publishable = store.drops.find((item) => item.id === "phase3-market");
    const published = await applyDropChange("publish_drop", { revision: store.revision, id: "phase3-market", updatedAt: publishable?.updatedAt });
    assert.equal(published.status, 200);
    const listed = await dropsGet(request("/api/public/drops?location=manila"));
    const listedBody = await listed.json();
    assert.equal(listedBody.drops.some((item: { id: string }) => item.id === "phase3-market"), true);
    const discovery = await dropsGet(request("/api/public/drops"));
    assert.equal(discovery.status, 200);
    const publicDrops = (await discovery.json()).drops as { id: string; city: string; nextDate: string }[];
    assert.equal(publicDrops.find(drop => drop.id === "phase3-market")?.city, "Manila");
    assert.deepEqual(publicDrops.map(drop => drop.nextDate), publicDrops.map(drop => drop.nextDate).sort());
    const live = await dropGet(request("/api/public/drops/phase3-market"));
    const liveBody = await live.json();
    assert.equal(liveBody.status, "published");
    assert.equal(liveBody.dates[0].offerings[0].committed, 0);

    const changed = await service.from("product_sizes").update({ price_centavos: 99999 }).eq("product_id", "keylime").eq("id", "4-inch");
    assert.equal(changed.error, null);
    const priced = (await loadDrops()).drops.find((item) => item.id === "phase3-market");
    assert.equal(priced?.offerings.find((item) => item.id === "keylime-4")?.priceCentavos, 24000);

    store = await loadDrops();
    const source = store.drops.find((item) => item.id === "phase3-market");
    const copy = await applyDropChange("duplicate_drop", { revision: store.revision, id: "phase3-market", updatedAt: source?.updatedAt, newId: "phase3-copy" });
    assert.equal(copy.status, 200);
    const copied = (await loadDrops()).drops.find((item) => item.id === "phase3-copy");
    assert.equal(copied?.status, "draft");
    assert.equal(copied?.dates.length, 0);
    assert.equal(copied?.offerings.length, 2);
    const copyPreview = await previewGet(request("/api/admin/drops/preview?slug=phase3-copy", { cookie: refreshCookie(preview) ?? cookie }));
    assert.equal(copyPreview.status, 200);
    const afterCopy = await dropsGet(request("/api/public/drops?location=manila"));
    assert.equal((await afterCopy.json()).drops.some((item: { id: string }) => item.id === "phase3-copy"), false);

    store = await loadDrops();
    const publishedDrop = store.drops.find((item) => item.id === "phase3-market");
    const stale = await applyDropChange("save_drop", covered(store.revision - 1, publishedDrop?.updatedAt ?? "", 4));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "stale_save");
    assert.equal((await loadDrops()).drops.find((item) => item.id === "phase3-market")?.offerings[0].dates[0].allocated, 8);

    store = await loadDrops();
    const toHide = store.drops.find((item) => item.id === "phase3-market");
    const unpublished = await applyDropChange("unpublish_drop", { revision: store.revision, id: "phase3-market", updatedAt: toHide?.updatedAt });
    assert.equal(unpublished.status, 200);
    const gone = await dropGet(request("/api/public/drops/phase3-market"));
    assert.equal(gone.status, 404);

    store = await loadDrops();
    const toEnd = store.drops.find((item) => item.id === "phase3-market");
    await applyDropChange("publish_drop", { revision: store.revision, id: "phase3-market", updatedAt: toEnd?.updatedAt });
    store = await loadDrops();
    const ending = store.drops.find((item) => item.id === "phase3-market");
    const ended = await applyDropChange("end_drop", { revision: store.revision, id: "phase3-market", updatedAt: ending?.updatedAt });
    assert.equal(ended.status, 200);
    const endedPage = await dropGet(request("/api/public/drops/phase3-market"));
    assert.equal(endedPage.status, 200);
    assert.equal((await endedPage.json()).status, "ended");
    const endedList = await dropsGet(request("/api/public/drops?location=manila"));
    assert.equal((await endedList.json()).drops.some((item: { id: string }) => item.id === "phase3-market"), false);
    const discoveryAfterEnd = await dropsGet(request("/api/public/drops"));
    assert.equal((await discoveryAfterEnd.json()).drops.some((drop: { id: string }) => drop.id === "phase3-market"), false);
    const regularCity = await dropsGet(request("/api/public/drops?location=cebu"));
    assert.equal(regularCity.status, 404);
  } finally {
    await service.from("product_sizes").update({ price_centavos: originalPrice }).eq("product_id", "keylime").eq("id", "4-inch");
    await service.from("drops").delete().in("id", ids);
    await service.from("drop_snapshot").delete().eq("id", 1);
    await service.from("admin_users").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
});
