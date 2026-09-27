import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
import { productFieldsSchema, productIdSchema, toMenuItem } from "../src/lib/products/schema";
import { defaultProducts } from "../src/lib/products/defaults";
Object.assign(process.env, emulatorEnv);
const origin = "http://localhost:3001";

test("product validation preserves money and rejects unsafe identifiers and photos", () => {
  for (const id of ["new", "import", "images", "../secret", "Bad Name"]) assert.equal(productIdSchema.safeParse(id).success, false);
  for (const product of defaultProducts()) {
    const { id, version, updatedAt, legacyPriceCentavos, ...fields } = product;
    void id; void version; void updatedAt;
    assert.equal(productFieldsSchema.safeParse(fields).success, true);
    assert.equal(productFieldsSchema.safeParse({ ...fields, price: 1 }).success, false);
    assert.equal(productFieldsSchema.safeParse({ ...fields, image: { url: "javascript:alert(1)", alt: "Photo" } }).success, false);
    assert.equal(toMenuItem(product).price, legacyPriceCentavos === null ? undefined : legacyPriceCentavos / 100);
  }
});

test("product lifecycle, conflicts, storefront, uploads and access boundaries", async (t) => {
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { auth, db, app } = getServerFirebase();
  // Explicit demo-only fixtures: never read credentials or contact a real project.
  assert.equal(app.options.projectId, "demo-makalipie");
  const snapshot = await db.collection("products").get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  await db.doc("privateSettings/productCatalog").delete();
  const user = await auth.createUser({ email: `products-${Date.now()}@example.test`, password: "Product-tests-only!" });
  await db.doc(`admins/${user.uid}`).set({ role: "owner", active: true, displayName: "Product Test", email: user.email });
  const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "Product-tests-only!", returnSecureToken: true }) });
  const { idToken } = await login.json();
  const session = await fetch(`${origin}/api/admin/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  assert.equal(session.status, 200, await session.text());
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const request = (path: string, method = "GET", body?: unknown, extra: Record<string,string> = {}) => fetch(`${origin}/api/admin/products${path}`, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let product: ReturnType<typeof defaultProducts>[number];
  const fields = (p: typeof product) => { const { id, updatedAt, legacyPriceCentavos, ...f } = p; void id; void updatedAt; void legacyPriceCentavos; return f; };
  try {
    await t.test("reads do not import; anonymous and cross-origin writes fail", async () => {
      assert.equal((await fetch(`${origin}/api/admin/products`)).status, 401);
      const preview = await (await request("")).json();
      assert.equal(preview.initialized, false); assert.equal(preview.products.length, 7);
      assert.equal((await db.collection("products").get()).size, 0);
      assert.equal((await request("/import", "POST", undefined, { Origin: "https://evil.example" })).status, 403);
    });
    await t.test("imports once and preserves legacy prices", async () => {
      const imported = await request("/import", "POST"); assert.equal(imported.status, 200, await imported.clone().text());
      const data = await imported.json(); assert.equal(data.products.length, 7);
      product = data.products.find((p: typeof product) => p.id === "keylime"); assert.equal(product.legacyPriceCentavos, 24000);
      const edited = await request(`/${product.id}`, "PUT", { ...fields(product), name: "Citrus test tart", publicNotes: "Keep chilled", allergens: ["dairy"], sortOrder: 0 });
      assert.equal(edited.status, 200); product = (await edited.json()).product;
      await request("/import", "POST");
      const again = await (await request("")).json(); assert.equal(again.products.find((p: typeof product) => p.id === "keylime").name, "Citrus test tart");
      assert.equal(product.legacyPriceCentavos, 24000);
    });
    await t.test("stale editors and injected price changes cannot overwrite saved data", async () => {
      assert.equal((await request(`/${product.id}`, "PUT", { ...fields(product), version: product.version - 1 })).status, 409);
      assert.equal((await request(`/${product.id}`, "PUT", { ...fields(product), legacyPriceCentavos: 1 })).status, 400);
      const concurrent = await Promise.all([request(`/${product.id}`, "PUT", fields(product)), request(`/${product.id}`, "PUT", fields(product))]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
      product = (await concurrent.find((r) => r.status === 200)!.json()).product;
    });
    await t.test("saved products reach home, menu, structured data, and order form", async () => {
      for (const path of ["/", "/menu", "/order"]) {
        const html = await (await fetch(`${origin}${path}`)).text(); assert.match(html, /Citrus test tart/);
        if (path === "/menu") { assert.match(html, /Keep chilled/); assert.match(html, /dairy/); assert.match(html, /application\/ld\+json/); }
      }
      const hidden = await request(`/${product.id}`, "PUT", { ...fields(product), active: false }); assert.equal(hidden.status, 200); product = (await hidden.json()).product;
      for (const path of ["/", "/menu", "/order"]) assert.doesNotMatch(await (await fetch(`${origin}${path}`)).text(), /Citrus test tart/);
    });
    await t.test("creates hidden products, blocks duplicates and reserved links", async () => {
      const { version, ...newFields } = fields(product); void version;
      const created = await request("", "POST", { ...newFields, slug: "test-new-tart", name: "New test tart" }); assert.equal(created.status, 201);
      const data = await created.json(); assert.equal(data.product.legacyPriceCentavos, null); assert.equal(data.product.active, false);
      assert.equal((await request("", "POST", { ...newFields, slug: "test-new-tart" })).status, 409);
      assert.equal((await request("", "POST", { ...newFields, slug: "new" })).status, 400);
    });
    await t.test("validates photo contents and produces a public resized WebP", async () => {
      const upload = (body: Uint8Array, type = "image/png") => fetch(`${origin}/api/admin/products/images`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": type }, body: new Uint8Array(body).buffer });
      assert.equal((await upload(Buffer.from("<svg></svg>"), "image/svg+xml")).status, 415);
      assert.equal((await upload(Buffer.from("not a photo"))).status, 400);
      assert.equal((await upload(Buffer.alloc(3 * 1024 * 1024 + 1))).status, 413);
      const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#eac28c" } }).png().toBuffer();
      const result = await upload(png); assert.equal(result.status, 201, await result.clone().text());
      const { url } = await result.json(); assert.match(url, /^http:\/\/127.0.0.1:9199\//);
      const image = await fetch(url); assert.equal(image.status, 200);
      const info = await sharp(Buffer.from(await image.arrayBuffer())).metadata(); assert.equal(info.format, "webp"); assert.equal(info.width, 1600);
      assert.equal((await request(`/${product.id}`, "PUT", { ...fields(product), image: { url, alt: "Test pie photo" } })).status, 200);
    });
    await t.test("empty menu does not resurrect defaults; revoked owner loses write access", async () => {
      const products = await db.collection("products").get();
      await Promise.all(products.docs.map((doc) => doc.ref.update({ active: false })));
      const html = await (await fetch(`${origin}/order`)).text(); assert.match(html, /no products available/); assert.doesNotMatch(html, /Citrus test tart/);
      await db.doc(`admins/${user.uid}`).update({ role: "staff" });
      assert.equal((await request("")).status, 403); assert.equal((await request("/import", "POST")).status, 403);
    });
  } finally {
    await auth.deleteUser(user.uid); await db.doc(`admins/${user.uid}`).delete();
    const all = await db.collection("products").get(); await Promise.all(all.docs.map((doc) => doc.ref.delete())); await db.doc("privateSettings/productCatalog").delete();
  }
});
