import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_CACHE_CONTROL,
  catalogAccess,
  catalogCommandSchema,
  catalogRevision,
  formatPesos,
  planCatalogSave,
  presentCatalog,
  type StoredAddon,
  type StoredProduct,
} from "../src/lib/admin/catalog-v2";

const image = { url: "/images/buko.webp", alt: "Buko pie" };
const branches = ["cebu", "manila"];

function product(overrides: Partial<StoredProduct> = {}): StoredProduct {
  return {
    id: "buko",
    version: 2,
    name: "Buko",
    blurb: "Coconut pie",
    description: "A whole coconut pie.",
    category: "sweet",
    image,
    allergens: ["coconut"],
    publicNotes: "Baked daily",
    active: true,
    sortOrder: 1,
    legacyPriceCentavos: null,
    menuCategoryId: null,
    availableWeekdays: [5, 6, 0],
    unavailableDates: [],
    allowedAddonIds: ["note-card"],
    variants: [
      { id: "six-inch", label: "6 inch", pricingMode: "fixed", priceCentavos: 15000, minLeadDays: 0, active: true, sortOrder: 0 },
      { id: "nine-inch", label: "9 inch", pricingMode: "quote_required", priceCentavos: null, minLeadDays: 2, availableWeekdays: [], active: true, sortOrder: 1 },
    ],
    ...overrides,
  };
}

function addon(overrides: Partial<StoredAddon> = {}): StoredAddon {
  return {
    id: "note-card",
    version: 1,
    name: "Note card",
    priceCentavos: 2500,
    image: { url: "/brand/seal.png", alt: "Note card" },
    minLeadDays: 0,
    allergens: [],
    active: true,
    sortOrder: 0,
    scope: "per_order",
    customization: { enabled: true, label: "Message", required: false, maxLength: 300 },
    ...overrides,
  };
}

function snapshot(overrides: Partial<Parameters<typeof presentCatalog>[0]> = {}) {
  return presentCatalog({ products: [], addons: [], assignments: [], knownBranchIds: branches, branchVersion: 4, canEdit: true, ...overrides });
}

function command(entry: Record<string, unknown>, revision: string, managed = branches) {
  return catalogCommandSchema.parse({
    entry,
    expectedRevision: revision,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    managedBranchIds: managed,
  });
}

const baseEntry = {
  id: "buko",
  version: 2,
  kind: "product" as const,
  name: "Buko",
  description: "A whole coconut pie.",
  active: true,
  sortOrder: "1",
  imageUrl: image.url,
  imageAlt: image.alt,
  allergens: "coconut",
  weekdays: [0, 5, 6],
  blockedDates: [],
  branchIds: ["cebu"],
  sizes: [
    { key: "six-inch", name: "6 inch", active: true, price: "150", pricing: "fixed" as const, leadDays: "0", weekdays: null },
    { key: "nine-inch", name: "9 inch", active: true, price: "", pricing: "quote_required" as const, leadDays: "2", weekdays: [] },
  ],
  price: "",
  leadDays: "0",
  scope: "per_order" as const,
  messageEnabled: false,
  messageRequired: false,
  messageLabel: "",
  messageMax: "100",
};

test("catalog access is separate from edit, and an empty catalog is a real snapshot", () => {
  assert.equal(CATALOG_CACHE_CONTROL, "private, no-store");
  assert.deepEqual(catalogAccess({ role: "staff", pages: {} }), { allowed: false, canEdit: false });
  assert.deepEqual(catalogAccess({ role: "staff", pages: { catalog: true } }), { allowed: true, canEdit: false });
  assert.equal(catalogAccess({ role: "staff", pages: { catalog: true, catalogActions: { edit: true } } }).canEdit, true);
  assert.equal(catalogAccess({ role: "owner", pages: { catalog: false, catalogActions: { edit: false } } }).canEdit, true);
  const empty = snapshot();
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.revision, catalogRevision({ products: [], addons: [], branchVersion: 4, assignments: [] }));
});

test("presentation keeps prices exact, distinguishes inherited days, and defaults a missing assignment to Cebu", () => {
  assert.equal(formatPesos(199), "1.99");
  assert.equal(formatPesos(100), "1");
  assert.equal(formatPesos(10), "0.10");
  const body = snapshot({
    products: [product(), product({ id: "ube", name: "Ube", sortOrder: 1, variants: [{ id: "slice", label: "Slice", pricingMode: "fixed", priceCentavos: 10000, minLeadDays: 0, active: false, sortOrder: 0 }] })],
    addons: [addon()],
    assignments: [{ productId: "ube", variantId: "slice", branchIds: [], mode: "regular" }],
  });
  const buko = body.entries.find((entry) => entry.id === "buko");
  const ube = body.entries.find((entry) => entry.id === "ube");
  const note = body.entries.find((entry) => entry.id === "note-card");
  assert.deepEqual(buko?.branchIds, ["cebu"]);
  assert.equal(buko?.sizes[0].price, "150");
  assert.equal(buko?.sizes[0].weekdays, null);
  assert.deepEqual(buko?.sizes[1].weekdays, []);
  assert.equal(buko?.sizes[1].price, "");
  assert.deepEqual(ube?.branchIds, []);
  assert.equal(note?.description, "");
  assert.equal(note?.price, "25");
  assert.deepEqual(body.entries.map((entry) => entry.id), ["note-card", "buko", "ube"]);
});

test("a save keeps compatibility lists, deactivates omitted sizes, and does not drop unmanaged branches", () => {
  const assignments = [{ productId: "buko", variantId: "six-inch", branchIds: ["cebu"], mode: "regular" as const }, { productId: "buko", variantId: "nine-inch", branchIds: ["cebu"], mode: "preorder" as const }];
  const current = snapshot({ products: [product()], addons: [addon()], assignments });
  const saved = planCatalogSave({
    command: command({ ...baseEntry, sizes: [baseEntry.sizes[0]], branchIds: ["manila"] }, current.revision, ["manila"]),
    products: [product()],
    addons: [addon()],
    assignments,
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: ["manila"],
  });
  assert.equal(saved.ok, true);
  if (!saved.ok || !saved.product) return;
  assert.equal(saved.product.data.allowedAddonIds && (saved.product.data.allowedAddonIds as string[]).join(), "note-card");
  assert.equal(saved.product.data.category, "sweet");
  assert.equal(saved.product.data.publicNotes, "Baked daily");
  const nine = saved.product.variants.find((variant) => variant.id === "nine-inch");
  assert.equal(nine?.data.active, false);
  const six = saved.assignments.find((assignment) => assignment.variantId === "six-inch");
  assert.deepEqual(six?.branchIds, ["cebu", "manila"]);
  const quote = saved.product.variants.find((variant) => variant.id === "six-inch");
  assert.equal(quote?.data.priceCentavos, 15000);
  assert.equal("availableWeekdays" in (quote?.data ?? {}), false);
});

test("quotes, new links, permissions, and stale revisions are decided before writing", () => {
  const current = snapshot({ products: [product()] });
  const quoted = planCatalogSave({
    command: command({
      ...baseEntry,
      sizes: [{ key: "ten-inch", name: "10 inch", active: true, price: "", pricing: "quote_required", leadDays: "1", weekdays: null }],
    }, current.revision),
    products: [product()],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(quoted.ok, true);
  if (quoted.ok && quoted.product) {
    const ten = quoted.product.variants.find((variant) => variant.id === "ten-inch");
    assert.equal(ten?.data.priceCentavos, null);
    assert.equal(ten?.data.active, true);
    assert.equal(quoted.product.variants.some((variant) => variant.id === "six-inch" && variant.data.active === false), true);
  }
  const blank = planCatalogSave({
    command: command({ ...baseEntry, sizes: [{ ...baseEntry.sizes[0], price: "" }] }, current.revision),
    products: [product()],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.match(blank.error.message, /peso price/);
  const stale = planCatalogSave({
    command: command(baseEntry, "aaaaaaaaaaaaaaaa"),
    products: [product()],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.kind, "conflict");
  const readonly = planCatalogSave({
    command: command(baseEntry, current.revision),
    products: [product()],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: false,
    manageableBranchIds: [],
  });
  assert.equal(readonly.ok, false);
  if (!readonly.ok) assert.equal(readonly.error.kind, "permission");
  const described = planCatalogSave({
    command: command({
      id: "",
      version: 0,
      kind: "addon",
      name: "Candle",
      description: "A small candle",
      active: false,
      sortOrder: "3",
      imageUrl: "/brand/seal.png",
      imageAlt: "Candle",
      allergens: "",
      weekdays: [],
      blockedDates: [],
      branchIds: [],
      sizes: [],
      price: "20",
      leadDays: "0",
      scope: "per_item",
      messageEnabled: false,
      messageRequired: false,
      messageLabel: "",
      messageMax: "100",
    }, snapshot().revision),
    products: [],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(described.ok, false);
  if (!described.ok) assert.match(described.error.message, /not stored/);
  assert.notEqual(catalogRevision({ products: [{ id: "buko", version: 2 }], addons: [], branchVersion: 4, assignments: [] }), catalogRevision({ products: [{ id: "buko", version: 3 }], addons: [], branchVersion: 4, assignments: [] }));
  assert.throws(() => catalogCommandSchema.parse({ ...command(baseEntry, current.revision), idempotencyKey: "nope" }));
});

test("sizes are stored in inches and a category with pies cannot be removed", () => {
  const current = snapshot({ products: [product({ menuCategoryId: "weekend" })], sections: [{ id: "weekend", name: "Weekend specials", note: "Friday to Sunday", sortOrder: 0 }] });
  const saved = planCatalogSave({
    command: command({ ...baseEntry, sizes: [baseEntry.sizes[0], { ...baseEntry.sizes[1], weekdays: null }] }, current.revision),
    products: [product({ menuCategoryId: "weekend" })],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    sections: current.sections,
    canEdit: true,
    manageableBranchIds: branches,
  });
  if (!saved.ok) throw new Error(saved.error.message);
  if (saved.ok && saved.product) {
    assert.equal(saved.product.variants.find((variant) => variant.id === "six-inch")?.data.label, "6\"");
    assert.equal(saved.product.variants.find((variant) => variant.id === "nine-inch")?.data.label, "9\"");
  }
  const unnamed = planCatalogSave({
    command: command({ ...baseEntry, sizes: [{ ...baseEntry.sizes[0], name: "Standard" }] }, current.revision),
    products: [product({ menuCategoryId: "weekend" })],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    sections: current.sections,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(unnamed.ok, false);
  if (!unnamed.ok) assert.match(unnamed.error.message, /inches/);
  const removed = planCatalogSave({
    command: catalogCommandSchema.parse({ sections: [], expectedRevision: current.revision, idempotencyKey: "22222222-2222-4222-8222-222222222222" }),
    products: [product({ menuCategoryId: "weekend" })],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    sections: current.sections,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(removed.ok, false);
  if (!removed.ok) assert.match(removed.error.message, /another category/);
});

test("a size photo is stored, and a blank photo is left off the size", () => {
  const stored = product({
    variants: [
      { ...product().variants[0], image: { url: "/images/brand/buko.webp", alt: "A buko pie" } },
      { ...product().variants[1], image: { url: "/images/brand/apple.webp", alt: "An apple tart" } },
    ],
  });
  const current = snapshot({ products: [stored] });
  const shown = current.entries.find((entry) => entry.id === "buko");
  assert.equal(shown?.sizes[0].imageUrl, "/images/brand/buko.webp");
  assert.equal(shown?.sizes[1].imageAlt, "An apple tart");
  const photo = { url: "/images/brand/pumpkin-spice-10.webp", alt: "A large pumpkin tart with a whipped-cream border and leaf cookies on a white board" };
  const saved = planCatalogSave({
    command: command({
      ...baseEntry,
      sizes: [
        { ...baseEntry.sizes[0], imageUrl: photo.url, imageAlt: photo.alt },
        { ...baseEntry.sizes[1], imageUrl: " ", imageAlt: "" },
      ],
    }, current.revision),
    products: [stored],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok || !saved.product) return;
  assert.deepEqual(saved.product.variants.find((variant) => variant.id === "six-inch")?.data.image, photo);
  assert.equal("image" in (saved.product.variants.find((variant) => variant.id === "nine-inch")?.data ?? {}), false);
  const rejected = planCatalogSave({
    command: command({
      ...baseEntry,
      sizes: [{ ...baseEntry.sizes[0], imageUrl: "https://example.com/pie.webp", imageAlt: "A pie" }],
    }, current.revision),
    products: [stored],
    addons: [],
    assignments: [],
    knownBranchIds: branches,
    branchVersion: 4,
    canEdit: true,
    manageableBranchIds: branches,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.error.message, /Size 1/);
});
