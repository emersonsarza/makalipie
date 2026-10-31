import assert from "node:assert/strict";
import test from "node:test";
import { menuSizes } from "../src/lib/catalog/menu-view";
import type { MenuItem } from "../src/lib/site";

const item: MenuItem = {
  slug: "weekend-special",
  name: "Weekend Special",
  kind: "sweet",
  blurb: "A weekend pie.",
  description: "A weekend pie.",
  image: { src: "/images/brand/apple.webp", alt: "Weekend pie" },
  variants: [
    { id: "four-regular", label: '4"', pricingMode: "fixed", priceCentavos: 24000, minLeadDays: 0, active: true, sortOrder: 0 },
    { id: "four-preorder", label: "4 inch", pricingMode: "fixed", priceCentavos: 28000, minLeadDays: 1, active: true, sortOrder: 1 },
    { id: "ten-preorder", label: '10"', pricingMode: "fixed", priceCentavos: 250000, minLeadDays: 3, active: true, sortOrder: 2 },
    { id: "ten-inactive", label: '10"', pricingMode: "fixed", priceCentavos: 250000, minLeadDays: 3, active: false, sortOrder: 3 },
  ],
};

test("main menu contains every active 4-inch size, including advance-preparation specials", () => {
  const result = menuSizes([item], false);
  assert.deepEqual(result[0]?.variants?.map(variant => variant.id), ["four-regular", "four-preorder"]);
});

test("pre-orders contain only larger active sizes that require advance preparation", () => {
  const result = menuSizes([item], true);
  assert.deepEqual(result[0]?.variants?.map(variant => variant.id), ["ten-preorder"]);
});

test("products without a matching size are omitted from the selected menu", () => {
  assert.deepEqual(menuSizes([{ ...item, variants: [item.variants![2]] }], false), []);
  assert.deepEqual(menuSizes([{ ...item, variants: [item.variants![0]] }], true), []);
});

test("a size photo replaces the product image when that size is the card", () => {
  const photo = { url: "/images/brand/pumpkin-spice-10.webp", alt: "A large pumpkin tart with a whipped-cream border and leaf cookies on a white board" };
  const shown = menuSizes([{ ...item, variants: [{ ...item.variants![2], image: photo }] }], true);
  assert.equal(shown[0]?.image.src, photo.url);
  assert.equal(shown[0]?.image.alt, photo.alt);
  assert.equal(menuSizes([item], false)[0]?.image.src, item.image.src);
});

test("sizes that share a photo use it, and mixed photos keep the product image", () => {
  const shared = { url: "/images/brand/apple.webp", alt: "An apple tart" };
  const other = { url: "/images/brand/buko.webp", alt: "A buko tart" };
  const ten = item.variants![2];
  const same = menuSizes([{ ...item, variants: [{ ...ten, image: shared }, { ...ten, id: "ten-other", image: shared }] }], true);
  const mixed = menuSizes([{ ...item, variants: [{ ...ten, image: shared }, { ...ten, id: "ten-other", image: other }] }], true);
  assert.equal(same[0]?.image.src, shared.url);
  assert.equal(mixed[0]?.image.src, item.image.src);
});
