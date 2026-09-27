import "server-only";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { getServerFirebase } from "@/lib/firebase/server";
import { defaultVariant } from "@/lib/catalog/defaults";
import { defaultProducts } from "./defaults";
import { productFieldsSchema, type Product, type ProductFields, type ProductList } from "./schema";

export class ProductError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function decodeProduct(doc: DocumentSnapshot): Product {
  const data = doc.data()!;
  const fields = productFieldsSchema.parse({
    slug: data.slug, name: data.name, blurb: data.blurb, description: data.description,
    category: data.category, image: data.image, allergens: data.allergens,
    publicNotes: data.publicNotes, active: data.active, sortOrder: data.sortOrder,
  });
  if (!Number.isSafeInteger(data.version) || data.version < 1 ||
      !(data.legacyPriceCentavos === null || (Number.isSafeInteger(data.legacyPriceCentavos) && data.legacyPriceCentavos >= 0))) {
    throw new Error("Invalid stored product.");
  }
  return { ...fields, id: doc.id, version: data.version, legacyPriceCentavos: data.legacyPriceCentavos,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : null };
}

export async function listProducts(): Promise<ProductList> {
  const { db } = getServerFirebase();
  // A transaction keeps the import marker and product snapshot consistent.
  return db.runTransaction(async (tx) => {
    const marker = await tx.get(db.doc("privateSettings/productCatalog"));
    if (!marker.exists) return { initialized: false, products: defaultProducts() };
    const snapshot = await tx.get(db.collection("products"));
    return { initialized: true, products: snapshot.docs.map(decodeProduct).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
  }, { readOnly: true });
}

export async function importProducts(uid: string) {
  const { db } = getServerFirebase();
  return db.runTransaction(async (tx) => {
    const marker = db.doc("privateSettings/productCatalog");
    if ((await tx.get(marker)).exists) return;
    const defaults = defaultProducts();
    const existing = await Promise.all(defaults.map((p) => tx.get(db.doc(`products/${p.id}`))));
    defaults.forEach((product, i) => {
      if (existing[i].exists) return;
      const { id, updatedAt: _updatedAt, ...fields } = product;
      void _updatedAt;
      tx.create(db.doc(`products/${id}`), { ...fields, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    });
    tx.create(marker, { initializedAt: FieldValue.serverTimestamp(), initializedBy: uid });
  });
}

export async function saveProduct(fields: ProductFields, uid: string, version?: number) {
  const { db } = getServerFirebase();
  const ref = db.doc(`products/${fields.slug}`);
  await db.runTransaction(async (tx) => {
    const [marker, existing] = await Promise.all([tx.get(db.doc("privateSettings/productCatalog")), tx.get(ref)]);
    if (!marker.exists) throw new ProductError(409, "Import the existing menu before adding or editing products.");
    if (version === undefined && existing.exists) throw new ProductError(409, "That product link is already in use. Choose another link.");
    if (version !== undefined && (!existing.exists || existing.data()?.version !== version)) {
      throw new ProductError(409, "This product changed since you opened it. Your edits are still here; reload the latest product before saving again.");
    }
    const timestamps = { updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
    if (version === undefined) {
      tx.create(ref, { ...fields, ...timestamps, createdAt: FieldValue.serverTimestamp(), legacyPriceCentavos: null, version: 1, availableWeekdays: [], unavailableDates: [], allowedAddonIds: [] });
      tx.create(ref.collection("variants").doc("standard"), defaultVariant({ ...fields, id: fields.slug, version: 1, updatedAt: null, legacyPriceCentavos: null }));
    } else {
      // Preserve prices, future variants, and creation metadata.
      tx.update(ref, { ...fields, ...timestamps, version: version + 1 });
    }
  });
  return decodeProduct(await ref.get());
}

export async function findProduct(id: string) {
  const { db } = getServerFirebase();
  const doc = await db.doc(`products/${id}`).get();
  return doc.exists ? decodeProduct(doc) : null;
}
