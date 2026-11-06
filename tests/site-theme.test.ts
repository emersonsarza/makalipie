import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { resolveSiteTheme, themedHref, themeBootstrap } from "../src/lib/site-theme";

test("Christmas is the default; only original selects the original design", () => {
  for (const value of [null, "", "christmas", "unknown"]) assert.equal(resolveSiteTheme(value), "christmas");
  assert.equal(resolveSiteTheme("original"), "original");
});

test("customer destinations preserve filters and fragments", () => {
  assert.equal(themedHref("/menu?view=preorders#menu-pies", "original"), "/menu?view=preorders&theme=original#menu-pies");
  assert.equal(themedHref("/order?branch=cebu", "christmas"), "/order?branch=cebu&theme=christmas");
  assert.equal(themedHref("/menu?theme=original", "christmas"), "/menu?theme=original");
  for (const href of ["#story", "https://instagram.com/makalipie", "//example.com", "/admin", "/admin/login", "/v1/catalog", "/api/orders"]) {
    assert.equal(themedHref(href, "christmas"), href);
  }
});

test("pre-paint initialization resolves direct links and excludes admin", () => {
  for (const [pathname, search, expected] of [
    ["/", "", "christmas"], ["/menu", "?theme=original&view=preorders", "original"],
    ["/terms", "?theme=unknown", "christmas"], ["/admin/login", "?theme=christmas", "original"],
    ["/v1/catalog", "", "original"],
  ]) {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    vm.runInNewContext(themeBootstrap, { document, location: { pathname, search }, URLSearchParams });
    assert.equal(document.documentElement.dataset.siteTheme, expected);
  }
});
