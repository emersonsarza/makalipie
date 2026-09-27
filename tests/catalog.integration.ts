import assert from "node:assert/strict";
import test from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
Object.assign(process.env, emulatorEnv);
const origin = "http://localhost:3001";
test("catalog migration, editing, server previews, access control and storefront", async (t) => {
  const { getServerFirebase } = await import("../src/lib/firebase/server"); const { app, db, auth } = getServerFirebase(); assert.equal(app.options.projectId, "demo-makalipie");
  await db.recursiveDelete(db.collection("products")); await db.recursiveDelete(db.collection("addons"));
  await db.doc("privateSettings/catalogV2").delete(); await db.doc("privateSettings/productCatalog").delete();
  const user = await auth.createUser({ email: `catalog-${Date.now()}@example.test`, password: "Catalog-test-only!" });
  await db.doc(`admins/${user.uid}`).set({ role: "owner", active: true, email: user.email, displayName: "Catalog Test" });
  const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "Catalog-test-only!", returnSecureToken: true }) });
  const { idToken } = await login.json();
  const session = await fetch(`${origin}/api/admin/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }); assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const post = (body: unknown, requestOrigin = origin) => fetch(`${origin}/api/admin/catalog`, { method: "POST", headers: { Origin: requestOrigin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const read = () => fetch(`${origin}/api/admin/catalog`, { headers: { Cookie: cookie } });
  const preview = (body: unknown) => fetch(`${origin}/api/catalog/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let catalog: import("../src/lib/catalog/schema").Catalog;
  const options = (p: typeof catalog.products[number]) => ({ version: p.version, variants: p.variants, availableWeekdays: p.availableWeekdays, unavailableDates: p.unavailableDates, allowedAddonIds: p.allowedAddonIds });
  try {
    await t.test("owner-only setup, existing product edits and repeatable import", async () => {
      assert.equal((await fetch(`${origin}/api/admin/catalog`)).status, 401);
      assert.equal((await post({ action: "initialize" }, "https://evil.example")).status, 403);
      assert.equal((await post({ action: "initialize" })).status, 409);
      await fetch(`${origin}/api/admin/products/import`, { method: "POST", headers: { Origin: origin, Cookie: cookie } });
      await db.doc("products/keylime").update({ name: "Edited lime pie" });
      const setup = await post({ action: "initialize" }); assert.equal(setup.status, 200, await setup.clone().text()); catalog = await setup.json();
      assert.equal(catalog.products[0].name, "Edited lime pie"); assert.equal(catalog.products[0].variants[0].priceCentavos, 24000);
      assert.deepEqual(catalog.products.find((p) => p.id === "buko")!.availableWeekdays, [5,6,0]);
      assert.equal(catalog.addons.find((a) => a.id === "note-card")!.customization.enabled, true);
    });
    await t.test("variant changes have conflict protection and become the price source", async () => {
      const p = catalog.products.find((p) => p.id === "keylime")!;
      const fields = { ...options(p), variants: [{ ...p.variants[0], priceCentavos: 25050, label: "Small tart" }, { ...p.variants[0], id: "large", label: "Large pie", priceCentavos: null, pricingMode: "quote_required" as const }] };
      const saved = await post({ action: "product", id: p.id, fields }); assert.equal(saved.status, 200, await saved.clone().text()); catalog = await saved.json();
      assert.equal((await post({ action: "product", id: p.id, fields })).status, 409);
      await post({ action: "initialize" }); catalog = await (await read()).json(); assert.equal(catalog.products.find((row) => row.id === p.id)!.variants.find((v) => v.id === "standard")!.priceCentavos, 25050);
      const updated = catalog.products.find((p) => p.id === "keylime")!;
      assert.equal((await post({ action: "product", id: p.id, fields: { ...options(updated), variants: [updated.variants[0]] } })).status, 400);
      for (const page of ["/menu", "/order"]) { const html = await (await fetch(`${origin}${page}`)).text(); assert.match(html, /Small tart/); assert.match(html, /Large pie/); assert.match(html, /250.5/); }
    });
    await t.test("server recalculates prices and rejects inactive sizes, bad dates and messages", async () => {
      const selection = { date: "2099-01-02", lines: [{ productId: "keylime", variantId: "standard", quantity: 2, addons: [] }], addons: [{ id: "note-card", message: "Hello!" }] };
      const quote = await preview(selection); assert.equal(quote.status, 200, await quote.clone().text()); assert.equal((await quote.json()).knownSubtotalCentavos, 51600);
      assert.equal((await preview({ ...selection, priceCentavos: 1 })).status, 400);
      assert.equal((await preview({ ...selection, date: "2000-01-01" })).status, 400);
      assert.equal((await preview({ ...selection, addons: [{ id: "birthday-topper", message: "forbidden" }] })).status, 400);
      const p = catalog.products.find((p) => p.id === "keylime")!;
      const saved = await post({ action: "product", id: p.id, fields: { ...options(p), unavailableDates: ["2099-01-02"], variants: p.variants.map((v) => ({ ...v, active: false })) } }); assert.equal(saved.status, 200); catalog = await saved.json();
      assert.equal((await preview(selection)).status, 400);
      const html = await (await fetch(`${origin}/order`)).text(); assert.doesNotMatch(html, /Edited lime pie · Small tart/);
    });
    await t.test("add-on CRUD, deactivation, scope and duplicate protection", async () => {
      const { id: _id, version: _version, ...base } = catalog.addons[0]; void _id; void _version;
      const addon = { id: "test-extra", version: 0, fields: { ...base, name: "Test extra", scope: "per_item", active: false } };
      const result = await post({ action: "addon", addon }); assert.equal(result.status, 200); catalog = await result.json();
      assert.equal((await post({ action: "addon", addon })).status, 409);
      assert.equal((await post({ action: "addon", addon: { ...addon, id: "invalid-price", fields: { ...base, priceCentavos: -1 } } })).status, 400);
      await db.doc(`admins/${user.uid}`).update({ active: false }); assert.equal((await post({ action: "initialize" })).status, 403);
    });
  } finally {
    await auth.deleteUser(user.uid); await db.doc(`admins/${user.uid}`).delete();
    await db.recursiveDelete(db.collection("products")); await db.recursiveDelete(db.collection("addons")); await db.doc("privateSettings/catalogV2").delete(); await db.doc("privateSettings/productCatalog").delete();
  }
});
