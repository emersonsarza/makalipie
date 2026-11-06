import assert from "node:assert/strict";
import test from "node:test";
import { orderProductHref, preorderMenuHref } from "../src/lib/order-intent";
import { staticPublicMenu } from "../src/lib/public/static-shop";

test("preorder redirect preserves theme and other query values while selecting preorder view", () => {
  const href = preorderMenuHref({ theme: "original", branch: "cebu", view: "regular", filter: ["sweet", "weekend"] });
  const url = new URL(href, "https://example.com");
  assert.equal(url.pathname, "/menu");
  assert.equal(url.searchParams.get("theme"), "original");
  assert.equal(url.searchParams.get("view"), "preorders");
  assert.deepEqual(url.searchParams.getAll("filter"), ["sweet", "weekend"]);
});

test("product links carry a product and unambiguous size without adding it to the cart", () => {
  const item = staticPublicMenu().items[0];
  const single = { ...item, variants: item.variants?.slice(0, 1) };
  const href = new URL(orderProductHref(single), "https://example.com");
  assert.equal(href.searchParams.get("product"), item.slug);
  assert.equal(href.searchParams.get("size"), single.variants?.[0]?.id);
  assert.equal(href.searchParams.has("quantity"), false);
  const multi = new URL(orderProductHref(item), "https://example.com");
  if ((item.variants?.length ?? 0) > 1) assert.equal(multi.searchParams.has("size"), false);
});

test("public menu contains no draft copy or obsolete month-specific section heading", () => {
  const menu = staticPublicMenu();
  assert.equal(menu.items.some(item => /placeholder|October special/i.test(`${item.description} ${item.blurb}`)), false);
  assert.equal(menu.sections.some(section => /October special/i.test(section.name)), false);
});
