import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getServerFirebase } from "@/lib/firebase/server";
import { decodeProduct, ProductError } from "@/lib/products/store";
import { defaultProducts } from "@/lib/products/defaults";
import { defaultAddons, defaultVariant } from "./defaults";
import { addonFieldsSchema, productCatalogSchema, variantSchema, type AddonFields, type Catalog, type ProductCatalog } from "./schema";
const sorted = <T extends { sortOrder: number; id: string }>(rows: T[]) => rows.sort((a,b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
export async function readCatalog(): Promise<Catalog> {
  const { db } = getServerFirebase();
  return db.runTransaction(async (tx) => {
    const [marker, productsMarker, docs, addonDocs] = await Promise.all([tx.get(db.doc("privateSettings/catalogV2")), tx.get(db.doc("privateSettings/productCatalog")), tx.get(db.collection("products")), tx.get(db.collection("addons"))]);
    const products = productsMarker.exists ? docs.docs.map(decodeProduct) : defaultProducts();
    const variants = await Promise.all(products.map((p) => tx.get(db.collection(`products/${p.id}/variants`))));
    return { initialized: marker.exists, products: sorted(products.map((p, i) => {
      const data = docs.docs.find((d) => d.id === p.id)?.data();
      const advanced = productCatalogSchema.parse({ version: p.version, variants: variants[i].empty && !marker.exists ? [defaultVariant(p)] : variants[i].docs.map((d) => variantSchema.parse({ ...d.data(), id: d.id })), availableWeekdays: data?.availableWeekdays ?? (p.id === "buko" ? [5,6,0] : []), unavailableDates: data?.unavailableDates ?? [], allowedAddonIds: data?.allowedAddonIds ?? (!marker.exists ? defaultAddons().map((a) => a.id) : []) });
      return { ...p, ...advanced, variants: sorted(advanced.variants) };
    })), addons: sorted(marker.exists ? addonDocs.docs.map((d) => { const { version, ...fields } = d.data(); if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid add-on version"); return { ...addonFieldsSchema.parse(fields), id: d.id, version }; }) : defaultAddons()) };
  }, { readOnly: true });
}
export async function initializeCatalog(uid: string) {
  const { db } = getServerFirebase();
  await db.runTransaction(async (tx) => {
    const marker = db.doc("privateSettings/catalogV2");
    if ((await tx.get(marker)).exists) return;
    if (!(await tx.get(db.doc("privateSettings/productCatalog"))).exists) throw new ProductError(409, "Import your products first.");
    const products = await tx.get(db.collection("products"));
    const variants = await Promise.all(products.docs.map((d) => tx.get(d.ref.collection("variants"))));
    const addons = defaultAddons(); const addonDocs = await Promise.all(addons.map((a) => tx.get(db.doc(`addons/${a.id}`))));
    products.docs.forEach((doc, i) => {
      const product = decodeProduct(doc); const data = doc.data();
      if (variants[i].empty) tx.create(doc.ref.collection("variants").doc("standard"), defaultVariant(product));
      tx.update(doc.ref, { availableWeekdays: data.availableWeekdays ?? (doc.id === "buko" ? [5,6,0] : []), unavailableDates: data.unavailableDates ?? [], allowedAddonIds: data.allowedAddonIds ?? addons.map((a) => a.id), version: product.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    });
    addons.forEach(({ id, ...fields }, i) => { if (!addonDocs[i].exists) tx.create(db.doc(`addons/${id}`), fields); });
    tx.create(marker, { initializedAt: FieldValue.serverTimestamp(), initializedBy: uid });
  });
}
export async function saveProductCatalog(id: string, input: ProductCatalog, uid: string) {
  const { db } = getServerFirebase(); const ref = db.doc(`products/${id}`);
  await db.runTransaction(async (tx) => {
    const [marker, product, variants, addons] = await Promise.all([tx.get(db.doc("privateSettings/catalogV2")), tx.get(ref), tx.get(ref.collection("variants")), tx.get(db.collection("addons"))]);
    if (!marker.exists) throw new ProductError(409, "Set up catalog options first.");
    if (!product.exists) throw new ProductError(404, "Product not found.");
    if (product.data()?.version !== input.version) throw new ProductError(409, "This product changed in another editor. Reload the page before saving.");
    if (variants.docs.some((d) => !input.variants.some((v) => v.id === d.id))) throw new ProductError(400, "Keep existing sizes and deactivate them instead of removing them.");
    if (input.allowedAddonIds.some((id) => !addons.docs.some((d) => d.id === id))) throw new ProductError(400, "An allowed add-on no longer exists.");
    const { variants: rows, version, ...fields } = input;
    tx.update(ref, { ...fields, version: version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    rows.forEach(({ id: variantId, ...fields }) => tx.set(ref.collection("variants").doc(variantId), fields));
  });
}
export async function saveAddon(id: string, fields: AddonFields, version: number) {
  const { db } = getServerFirebase(); const ref = db.doc(`addons/${id}`);
  await db.runTransaction(async (tx) => {
    const [marker, existing] = await Promise.all([tx.get(db.doc("privateSettings/catalogV2")), tx.get(ref)]);
    if (!marker.exists) throw new ProductError(409, "Set up catalog options first.");
    if ((version === 0 && existing.exists) || (version > 0 && (!existing.exists || existing.data()?.version !== version))) throw new ProductError(409, "This add-on changed or its ID is already used. Reload before editing again.");
    tx.set(ref, { ...fields, version: version + 1 });
  });
}
