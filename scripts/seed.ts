import { FieldValue } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import { emulatorEnv } from "./emulator-env.mjs";
import { seedAddons, seedBranchSettings, seedPackages, seedPopups, seedProducts, seedSchedule, seedSections, seedShop, seedVariantRecord } from "../src/lib/catalog/seed-data";

Object.assign(process.env, emulatorEnv);

const OWNER_EMAIL = "owner@example.test";
const OWNER_PASSWORD = "Makalipie-demo-only!";

export async function seedAccount() {
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { auth, db } = getServerFirebase();
  let user;
  try {
    user = await auth.getUserByEmail(OWNER_EMAIL);
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email: OWNER_EMAIL, password: OWNER_PASSWORD, displayName: "Demo Owner" });
  }
  await db.doc(`admins/${user.uid}`).set({ email: OWNER_EMAIL, displayName: "Demo Owner", role: "owner", active: true });
  console.log(`Local emulator owner ready: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

export async function seedAdmin() {
  const { addonFieldsSchema, variantSchema } = await import("../src/lib/catalog/schema");
  const { menuSectionSchema } = await import("../src/lib/catalog/sections");
  const { parseBranchSettings } = await import("../src/lib/branches/schema");
  const { parsePopupSettings } = await import("../src/lib/popups/schema");
  const { scheduleSettingsSchema } = await import("../src/lib/scheduling/schema");
  const { shopSettingsSchema } = await import("../src/lib/settings/schema");
  const { packageSettingsSchema } = await import("../src/lib/admin/packages-v2");
  const { productFieldsSchema } = await import("../src/lib/products/schema");
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { auth, db } = getServerFirebase();

  let user;
  try {
    user = await auth.getUserByEmail(OWNER_EMAIL);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found") {
      console.error("Run pnpm seed account first. The owner login is not in the Auth emulator.");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  const admin = await db.doc(`admins/${user.uid}`).get();
  if (!admin.exists) {
    console.error("Run pnpm seed account first. The owner profile is missing.");
    process.exitCode = 1;
    return;
  }

  seedSections.forEach((section) => menuSectionSchema.parse(section));
  parseBranchSettings(seedBranchSettings);
  parsePopupSettings(seedPopups);
  scheduleSettingsSchema.parse(seedSchedule);
  shopSettingsSchema.parse(seedShop);
  packageSettingsSchema.parse(seedPackages);
  for (const product of seedProducts) {
    productFieldsSchema.parse({
      slug: product.id, name: product.name, blurb: product.blurb, description: product.description,
      category: product.category, image: product.image, allergens: [], publicNotes: product.publicNotes,
      active: true, sortOrder: product.sortOrder,
    });
    for (const size of product.sizes) {
      variantSchema.parse(seedVariantRecord(size));
      if (size.mode === "regular" && size.minLeadDays > 0) throw new Error(`${product.id} ${size.id} cannot be regular with preparation days.`);
    }
  }
  for (const addon of seedAddons) {
    const { id: _id, version: _version, ...fields } = addon;
    void _id; void _version;
    addonFieldsSchema.parse(fields);
  }

  const uid = user.uid;
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.doc("settings/menuSections"), { sections: seedSections, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("settings/branches"), { ...seedBranchSettings, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("settings/popups"), { ...seedPopups, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("settings/orderingSchedule"), { ...seedSchedule, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("settings/shop"), { ...seedShop, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("settings/packages"), { ...seedPackages, updatedAt: now, updatedBy: uid });
  batch.set(db.doc("privateSettings/productCatalog"), { initializedAt: now, initializedBy: uid }, { merge: true });
  batch.set(db.doc("privateSettings/catalogV2"), { initializedAt: now, initializedBy: uid }, { merge: true });

  for (const product of seedProducts) {
    const ref = db.doc(`products/${product.id}`);
    const existing = await ref.get();
    const fourInch = product.sizes.find((size) => size.id === "4-inch");
    batch.set(ref, {
      slug: product.id,
      name: product.name,
      blurb: product.blurb,
      description: product.description,
      category: product.category,
      image: product.image,
      allergens: [],
      publicNotes: product.publicNotes,
      active: true,
      sortOrder: product.sortOrder,
      version: 1,
      legacyPriceCentavos: fourInch?.priceCentavos ?? null,
      menuCategoryId: product.menuCategoryId,
      availableWeekdays: product.availableWeekdays,
      unavailableDates: [],
      allowedAddonIds: seedAddons.map((addon) => addon.id),
      createdAt: existing.get("createdAt") ?? now,
      updatedAt: now,
      updatedBy: uid,
    });
    const stored = await ref.collection("variants").get();
    const wanted = new Set(product.sizes.map((size) => size.id));
    for (const doc of stored.docs) if (!wanted.has(doc.id)) batch.delete(doc.ref);
    for (const size of product.sizes) {
      const { id, ...fields } = seedVariantRecord(size);
      batch.set(ref.collection("variants").doc(id), fields);
    }
  }
  for (const addon of seedAddons) {
    const { id, ...fields } = addon;
    batch.set(db.doc(`addons/${id}`), fields);
  }
  await batch.commit();
  console.log(`Admin catalog seeded for ${OWNER_EMAIL}.`);
}

const command = process.argv[2];
const invoked = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (invoked) {
  const run = command === "account" ? seedAccount : command === "admin" ? seedAdmin : null;
  if (!run) {
    console.error("Use pnpm seed account or pnpm seed admin.");
    process.exitCode = 1;
  } else {
    run().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      console.error("Start the Auth and Firestore emulators before seeding.");
      process.exitCode = 1;
    });
  }
}
