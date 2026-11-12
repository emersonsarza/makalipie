import assert from "node:assert/strict";
import test from "node:test";
import { manilaDate } from "../src/lib/catalog/rules";
import { inSeason, orderableDates, preparationStart, sizeEligibleOnDate, slotsForBranch } from "../src/lib/storefront/eligibility";
import { resolveSizeImage } from "../src/lib/storefront/images";
import { presentShop, selectFeatured } from "../src/lib/storefront/present";
import type { StoreCatalog, StoreProduct, StoreSize } from "../src/lib/storefront/types";

const updatedAt = "2026-11-11T00:00:00.000Z";

function size(id: string, mode: StoreSize["mode"], branchIds = ["cebu"]): StoreSize {
  return { id, label: id, priceCentavos: 1000, mode, enabled: true, sortOrder: id === "10-inch" ? 1 : 0, image: null, themeImages: [], branchIds };
}

function product(id: string, sectionId: string, extras: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id, name: id, shortDescription: "", description: "", allergens: [], sectionId, enabled: true, sortOrder: 0,
    image: { path: `/images/brand/${id}.webp`, alt: id }, seasonStart: null, seasonEnd: null, themeImages: [],
    updatedAt, sizes: [size("4-inch", "regular"), size("10-inch", "preorder")], ...extras,
  };
}

function catalog(extras: Partial<StoreCatalog> = {}): StoreCatalog {
  return {
    revision: 1,
    settings: { theme: "christmas", bookingHorizonDays: 7, preorderLeadDays: 3, instagramUrl: "", instagramDmUrl: "", messengerUrl: "", updatedAt },
    locations: [{
      id: "cebu", kind: "regular", name: "Cebu", address: "", mapUrl: "", hoursLabel: "Daily, 10am to 8pm",
      visible: true, pickupEnabled: true, deliveryEnabled: true, acceptingOrders: true, grabFoodUrl: "", foodpandaUrl: "", updatedAt,
    }],
    sections: [{ id: "classic", name: "Classic", note: "", sortOrder: 0, weekdays: [0, 1, 2, 3, 4, 5, 6], updatedAt }],
    products: [product("keylime", "classic")],
    addOns: [],
    schedules: [{ locationId: "cebu", enabled: true, opens: "10:00", cutoff: "19:00", weekdays: [0, 1, 2, 3, 4, 5, 6], updatedAt }],
    overrides: [],
    featuredIds: [],
    popups: [],
    ...extras,
  };
}

const morning = new Date("2026-11-11T01:00:00.000Z");

test("Manila midnight moves the booking horizon", () => {
  assert.equal(manilaDate(new Date("2026-11-11T15:59:59.000Z")), "2026-11-11");
  assert.equal(manilaDate(new Date("2026-11-11T16:00:00.000Z")), "2026-11-12");
  const before = orderableDates(catalog(), "cebu", new Date("2026-11-11T00:30:00.000Z")).map((day) => day.date);
  const after = orderableDates(catalog(), "cebu", new Date("2026-11-11T16:00:00.000Z")).map((day) => day.date);
  assert.equal(before[0], "2026-11-11");
  assert.equal(before.at(-1), "2026-11-18");
  assert.equal(before.includes("2026-11-19"), false);
  assert.equal(after[0], "2026-11-12");
  assert.equal(after.at(-1), "2026-11-19");
});

test("a season includes its first and last dates", () => {
  const pumpkin = product("pumpkin-spice", "classic", { seasonStart: "2027-10-01", seasonEnd: "2027-10-31" });
  assert.equal(inSeason(pumpkin, "2027-09-30"), false);
  assert.equal(inSeason(pumpkin, "2027-10-01"), true);
  assert.equal(inSeason(pumpkin, "2027-10-31"), true);
  assert.equal(inSeason(pumpkin, "2027-11-01"), false);
  const shop = catalog({ products: [pumpkin] });
  assert.equal(presentShop(shop, new Date("2026-11-11T01:00:00.000Z")).menu.some((section) => section.products.some((item) => item.id === "pumpkin-spice")), false);
  assert.equal(presentShop(shop, new Date("2027-10-01T01:00:00.000Z")).menu.some((section) => section.products.some((item) => item.id === "pumpkin-spice")), true);
  assert.equal(presentShop(shop, new Date("2027-10-31T01:00:00.000Z")).menu.some((section) => section.products.some((item) => item.id === "pumpkin-spice")), true);
  assert.equal(presentShop(shop, new Date("2027-11-01T01:00:00.000Z")).menu.some((section) => section.products.some((item) => item.id === "pumpkin-spice")), false);
});

test("hours, elapsed slots, closed weekdays, and a paused branch", () => {
  const open = slotsForBranch(catalog(), "cebu", "2026-11-11", morning);
  assert.deepEqual(open.map((slot) => slot.id), ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]);
  const later = slotsForBranch(catalog(), "cebu", "2026-11-11", new Date("2026-11-11T02:30:00.000Z"));
  assert.equal(later.some((slot) => slot.id === "10:00"), false);
  assert.equal(later[0]?.id, "11:00");

  const sunday = new Date("2026-11-15T01:00:00.000Z");
  const weekdays = catalog({
    schedules: [{ locationId: "cebu", enabled: true, opens: "10:00", cutoff: "19:00", weekdays: [1, 2, 3, 4, 5], updatedAt }],
    overrides: [{ locationId: "cebu", date: "2026-11-15", closed: false, opens: "12:00", cutoff: "15:00", updatedAt }],
    sections: [{ id: "classic", name: "Classic", note: "", sortOrder: 0, weekdays: [1, 2, 3, 4, 5], updatedAt }],
    settings: { theme: "christmas", bookingHorizonDays: 7, preorderLeadDays: 0, instagramUrl: "", instagramDmUrl: "", messengerUrl: "", updatedAt },
  });
  assert.deepEqual(slotsForBranch(weekdays, "cebu", "2026-11-15", sunday).map((slot) => slot.id), ["12:00", "13:00", "14:00"]);
  const pie = weekdays.products[0];
  const section = weekdays.sections[0];
  assert.equal(sizeEligibleOnDate(weekdays, pie, pie.sizes[0], section, "cebu", "2026-11-15", sunday), false);
  assert.equal(sizeEligibleOnDate(weekdays, pie, pie.sizes[1], section, "cebu", "2026-11-15", sunday), true);

  const paused = catalog({ locations: [{ ...catalog().locations[0], acceptingOrders: false }] });
  assert.deepEqual(orderableDates(paused, "cebu", morning), []);
});

test("preorder lead counts calendar days across a closed date", () => {
  const shop = catalog({
    settings: { theme: "christmas", bookingHorizonDays: 7, preorderLeadDays: 2, instagramUrl: "", instagramDmUrl: "", messengerUrl: "", updatedAt },
    schedules: [{ locationId: "cebu", enabled: true, opens: "10:00", cutoff: "19:00", weekdays: [1, 2, 3, 4, 5], updatedAt }],
    overrides: [{ locationId: "cebu", date: "2026-11-12", closed: true, opens: null, cutoff: null, updatedAt }],
  });
  assert.equal(preparationStart(shop, "cebu", morning), "2026-11-11");
  const pie = shop.products[0];
  assert.equal(sizeEligibleOnDate(shop, pie, pie.sizes[1], shop.sections[0], "cebu", "2026-11-13", morning), true);
  assert.equal(sizeEligibleOnDate(shop, pie, pie.sizes[1], shop.sections[0], "cebu", "2026-11-12", morning), false);
});

test("featured falls through an out-of-season rank and pop-ups expire after the end date", () => {
  const pies = ["buko", "smores", "pecan", "keylime"].map((id, index) => product(id, "classic", { sortOrder: index + 1 }));
  const pumpkin = product("pumpkin-spice", "classic", { sortOrder: 0, seasonStart: "2027-10-01", seasonEnd: "2027-10-31" });
  const shop = catalog({
    products: [pumpkin, ...pies],
    featuredIds: ["pumpkin-spice", "buko", "smores", "pecan", "keylime"],
    popups: [{ id: "sunday-market", locationId: "cebu", name: "Sunday Market", address: "Ayala", mapUrl: "", startDate: "2026-11-15", endDate: "2026-11-15", hours: "7am–3pm", items: ["Butter Chicken Curry"], updatedAt }],
  });
  assert.deepEqual(selectFeatured(shop, morning), ["buko", "smores", "pecan", "keylime"]);
  assert.deepEqual(selectFeatured(catalog({ locations: [{ ...catalog().locations[0], acceptingOrders: false }], products: pies, featuredIds: ["buko"] }), morning), []);
  assert.equal(presentShop(shop, new Date("2026-11-15T01:00:00.000Z")).popups[0]?.id, "sunday-market");
  assert.deepEqual(presentShop(shop, new Date("2026-11-16T01:00:00.000Z")).popups, []);
});

test("size images fall through the theme, the size, the product, then the default", () => {
  assert.equal(resolveSizeImage({
    theme: "christmas",
    sizeImage: null,
    themeImages: [{ theme: "christmas", path: "/images/christmas/keylime.webp", alt: "Christmas Keylime" }],
    productImage: { path: "/images/brand/keylime.webp", alt: "Keylime" },
  }).path, "/images/christmas/keylime.webp");
  assert.equal(resolveSizeImage({
    theme: "christmas",
    sizeImage: { path: "/images/brand/keylime-10.webp", alt: "Large Keylime" },
    themeImages: [],
    productImage: { path: "/images/brand/keylime.webp", alt: "Keylime" },
  }).path, "/images/brand/keylime-10.webp");
  assert.equal(resolveSizeImage({
    theme: "original",
    sizeImage: null,
    themeImages: [{ theme: "christmas", path: "/images/christmas/keylime.webp", alt: "Christmas Keylime" }],
    productImage: { path: "/images/brand/keylime.webp", alt: "Keylime" },
  }).path, "/images/brand/keylime.webp");
  assert.equal(resolveSizeImage({ theme: "original", sizeImage: null, themeImages: [], productImage: null }).path, "/images/brand/hero.webp");
});
