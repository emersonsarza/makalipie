import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { isAllowedMutationOrigin } from "./access";
import {
  CatalogCommandError,
  catalogAccess,
  planCatalogSave,
  presentCatalog,
  type CatalogCommand,
  type StoredAddon,
  type StoredAssignment,
  type StoredProduct,
} from "./catalog-v2";
import type { AdminIdentity } from "./schemas";
import { requireAdmin } from "./session";
import { defaultBranchSettings, parseBranchSettings, type BranchSettings } from "@/lib/branches/schema";
import { readBranchSettings } from "@/lib/branches/store";
import { forget, publicCacheKeys } from "@/lib/public-cache";
import { addonFieldsSchema, dateSchema, variantSchema } from "@/lib/catalog/schema";
import { getServerFirebase } from "@/lib/firebase/server";
import { z } from "zod";
import { parseMenuSections, type MenuSection } from "@/lib/catalog/sections";
import { productIdSchema, type Product } from "@/lib/products/schema";
import { shopSettingsSchema } from "@/lib/settings/schema";
import { ProductError, decodeProduct } from "@/lib/products/store";

const LOAD_ERROR = "Catalog couldn't be loaded. Please try again.";

export async function readAdminCatalog() {
  const admin = await requireAdmin();
  const access = catalogAccess(admin);
  if (!access.allowed) throw new CatalogCommandError(403, "permission", "You don't have access to this page. Ask the owner.");
  const loaded = await loadStored();
  return presentCatalog({ ...loaded, canEdit: access.canEdit, featuredProductIds: await readFeaturedProductIds() });
}

export async function commitAdminCatalog(request: Request, command: CatalogCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
    throw new CatalogCommandError(403, "permission", "This request is not allowed. Reload the page and try again.");
  }
  const admin = await requireAdmin();
  const access = catalogAccess(admin);
  if (!access.allowed) throw new CatalogCommandError(403, "permission", "You don't have access to this page. Ask the owner.");
  const preview = await loadStored();
  const manageable = admin.role === "owner" ? preview.knownBranchIds : admin.branchIds.filter((id) => preview.knownBranchIds.includes(id));
  const planned = planCatalogSave({ ...preview, command, canEdit: access.canEdit, manageableBranchIds: manageable });
  if (!planned.ok) throw planned.error;
  const replay = await claimCommand(admin, command);
  if (replay === "replay") return { ok: true as const, snapshot: await readAdminCatalog() };
  try {
    const { db } = getServerFirebase();
    await db.runTransaction(async (tx) => {
      const marker = db.doc("privateSettings/productCatalog");
      const catalogMarker = db.doc("privateSettings/catalogV2");
      const branchRef = db.doc("settings/branches");
      const sectionsRef = db.doc("settings/menuSections");
      const shopRef = db.doc("settings/shop");
      const [markerSnap, catalogSnap, branchSnap, productSnap, addonSnap, sectionsSnap, shopSnap] = await Promise.all([
        tx.get(marker), tx.get(catalogMarker), tx.get(branchRef), tx.get(db.collection("products")), tx.get(db.collection("addons")), tx.get(sectionsRef), tx.get(shopRef),
      ]);
      if (!markerSnap.exists) throw new CatalogCommandError(409, "conflict", "Import the existing menu before editing the catalog.");
      const variantSnaps = [];
      for (const doc of productSnap.docs) variantSnaps.push(await tx.get(doc.ref.collection("variants")));
      const loaded = storedFrom(productSnap.docs, variantSnaps, addonSnap.docs, branchSnap.exists ? branchSnap.data() : undefined, sectionsSnap.exists ? sectionsSnap.data() : undefined);
      const decision = planCatalogSave({ ...loaded, command, canEdit: access.canEdit, manageableBranchIds: manageable });
      if (!decision.ok) throw decision.error;
      if (decision.product) {
        const ref = db.doc(`products/${decision.product.id}`);
        const { version, ...fields } = decision.product.data;
        if (decision.product.create) tx.create(ref, { ...fields, version, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
        else tx.update(ref, { ...fields, version, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
        for (const variant of decision.product.variants) tx.set(ref.collection("variants").doc(variant.id), variant.data);
      }
      if (decision.addon) {
        const ref = db.doc(`addons/${decision.addon.id}`);
        if (decision.addon.create) tx.create(ref, decision.addon.data);
        else tx.set(ref, decision.addon.data);
      }
      if (decision.sections) {
        tx.set(sectionsRef, { sections: decision.sections, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
        for (const clear of decision.categoryClears ?? []) {
          tx.update(db.doc(`products/${clear.id}`), { menuCategoryId: null, version: clear.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
        }
      }
      const featured = decision.featured;
      if (featured) {
        const parsed = shopSettingsSchema.safeParse(shopSnap.exists ? shopSnap.data() : {});
        const current = parsed.success ? parsed.data.featuredProductIds : [];
        const ids = current.filter((id) => id !== featured.productId);
        if (featured.featured) ids.push(featured.productId);
        tx.set(shopRef, { featuredProductIds: ids }, { merge: true });
      }
      if (decision.assignments.length) {
        const settings = replaceAssignments(loaded.settings, decision.assignments);
        tx.set(branchRef, { ...settings, version: loaded.branchVersion + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
      }
      if (!catalogSnap.exists) tx.create(catalogMarker, { initializedAt: FieldValue.serverTimestamp(), initializedBy: admin.uid });
      tx.create(db.collection("catalogEvents").doc(), {
        actorUid: admin.uid,
        at: FieldValue.serverTimestamp(),
        kind: "entry" in command ? command.entry.kind : "section",
        id: decision.product?.id ?? decision.addon?.id ?? ("entry" in command ? command.entry.id : "sections"),
      });
    });
    await completeCommand(command.idempotencyKey);
    forget(publicCacheKeys.menu, publicCacheKeys.branches, publicCacheKeys.shop);
    return { ok: true as const, snapshot: await readAdminCatalog() };
  } catch (error) {
    await releaseCommand(command.idempotencyKey);
    throw error;
  }
}

async function loadStored() {
  const { db } = getServerFirebase();
  let settings: BranchSettings;
  try { settings = await readBranchSettings(); }
  catch { throw new ProductError(503, LOAD_ERROR); }
  const [products, addons, sectionsDoc] = await Promise.all([
    db.collection("products").get().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
    db.collection("addons").get().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
    db.doc("settings/menuSections").get().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
  ]);
  const variants = await Promise.all(products.docs.map((doc) => doc.ref.collection("variants").get()));
  return storedFrom(products.docs, variants, addons.docs, settings, sectionsDoc.exists ? sectionsDoc.data() : undefined);
}

function storedFrom(
  products: FirebaseFirestore.QueryDocumentSnapshot[],
  variants: FirebaseFirestore.QuerySnapshot[],
  addons: FirebaseFirestore.QueryDocumentSnapshot[],
  branches: FirebaseFirestore.DocumentData | BranchSettings | undefined,
  sectionsData: unknown,
): { products: StoredProduct[]; addons: StoredAddon[]; assignments: StoredAssignment[]; knownBranchIds: string[]; branchVersion: number; settings: BranchSettings; sections: MenuSection[] } {
  const settings = branches && "branches" in branches && Array.isArray(branches.branches) && "version" in branches && typeof (branches as BranchSettings).defaultBranch === "string" && !("updatedAt" in (branches as object))
    ? branches as BranchSettings
    : parseSettings(branches);
  return {
    products: products.map((doc, index) => productFrom(doc, variants[index])),
    addons: addons.map(addonFrom),
    assignments: settings.assignments,
    knownBranchIds: settings.branches.map((branch) => branch.id),
    branchVersion: settings.version,
    settings,
    sections: readSections(sectionsData),
  };
}

function parseSettings(data: FirebaseFirestore.DocumentData | undefined): BranchSettings {
  if (!data) return defaultBranchSettings();
  try {
    const { updatedAt: _at, updatedBy: _by, ...settings } = data;
    void _at; void _by;
    return parseBranchSettings(settings);
  } catch {
    throw new ProductError(503, LOAD_ERROR);
  }
}

function productFrom(doc: FirebaseFirestore.QueryDocumentSnapshot, variants: FirebaseFirestore.QuerySnapshot): StoredProduct {
  let product: Product;
  try { product = decodeProduct(doc); }
  catch { throw new ProductError(503, LOAD_ERROR); }
  const data = doc.data();
  const parsedVariants = variants.docs.map((variant) => {
    const parsed = variantSchema.safeParse({ ...variant.data(), id: variant.id });
    if (!parsed.success) throw new ProductError(503, LOAD_ERROR);
    return parsed.data;
  });
  const availableWeekdays = z.array(z.number().int().min(0).max(6)).max(7).safeParse(Array.isArray(data.availableWeekdays) ? data.availableWeekdays : []);
  const unavailableDates = z.array(dateSchema).max(366).safeParse(Array.isArray(data.unavailableDates) ? data.unavailableDates : []);
  const allowedAddonIds = z.array(productIdSchema).max(100).safeParse(Array.isArray(data.allowedAddonIds) ? data.allowedAddonIds : []);
  if (!availableWeekdays.success || !unavailableDates.success || !allowedAddonIds.success) throw new ProductError(503, LOAD_ERROR);
  return {
    id: product.id,
    version: product.version,
    name: product.name,
    blurb: product.blurb,
    description: product.description,
    category: product.category,
    image: product.image,
    allergens: product.allergens,
    publicNotes: product.publicNotes,
    active: product.active,
    sortOrder: product.sortOrder,
    legacyPriceCentavos: product.legacyPriceCentavos,
    availableWeekdays: availableWeekdays.data,
    unavailableDates: unavailableDates.data,
    menuCategoryId: product.menuCategoryId ?? null,
    allowedAddonIds: allowedAddonIds.data,
    variants: parsedVariants,
  };
}

function readSections(data: unknown): MenuSection[] {
  try { return parseMenuSections(data); }
  catch { throw new ProductError(503, LOAD_ERROR); }
}

function addonFrom(doc: FirebaseFirestore.QueryDocumentSnapshot): StoredAddon {
  const data = doc.data();
  const { version, ...fields } = data;
  const parsed = addonFieldsSchema.safeParse(fields);
  if (!parsed.success || !Number.isSafeInteger(version) || version < 1) throw new ProductError(503, LOAD_ERROR);
  return { ...parsed.data, id: doc.id, version };
}

function replaceAssignments(settings: BranchSettings, writes: StoredAssignment[]): BranchSettings {
  const next = [...settings.assignments];
  for (const write of writes) {
    const index = next.findIndex((assignment) => assignment.productId === write.productId && assignment.variantId === write.variantId);
    if (index >= 0) next[index] = write;
    else next.push(write);
  }
  return parseBranchSettings({ ...settings, assignments: next });
}

async function claimCommand(admin: AdminIdentity, command: CatalogCommand) {
  const ref = getServerFirebase().db.doc(`adminCatalogCommands/${command.idempotencyKey}`);
  const payloadHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== admin.uid || saved.payloadHash !== payloadHash) throw new CatalogCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const current = await loadStored();
    const moved = presentCatalog({ ...current, canEdit: true }).revision !== command.expectedRevision;
    if (moved) {
      await ref.set({ completed: true, pending: false }, { merge: true });
      return "replay" as const;
    }
    await ref.delete();
    return "open" as const;
  };
  const existing = await ref.get();
  if (existing.exists) {
    const judged = await judge(existing.data() ?? {});
    if (judged === "replay") return judged;
  }
  try {
    await ref.create({ uid: admin.uid, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new CatalogCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid: admin.uid, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}

async function completeCommand(key: string) {
  await getServerFirebase().db.doc(`adminCatalogCommands/${key}`).set({ completed: true, pending: false }, { merge: true });
}

async function releaseCommand(key: string) {
  const ref = getServerFirebase().db.doc(`adminCatalogCommands/${key}`);
  const saved = await ref.get();
  if (saved.exists && saved.data()?.completed !== true) await ref.delete().catch(() => undefined);
}

async function readFeaturedProductIds() {
  try {
    const snap = await getServerFirebase().db.doc("settings/shop").get();
    const parsed = shopSettingsSchema.safeParse(snap.exists ? snap.data() : {});
    return parsed.success ? parsed.data.featuredProductIds : [];
  } catch {
    return [];
  }
}
