/**
 * Persist the simplified catalogue without deleting products or sizes.
 * Dry-run until `--write` is passed. Safe to repeat.
 */
import { FieldValue } from "firebase-admin/firestore";
import { emulatorEnv } from "./emulator-env.mjs";
import { catalogMigrationPlan } from "../src/lib/catalog/migrate";
import type { BranchSettings } from "../src/lib/branches/schema";

Object.assign(process.env, emulatorEnv);

async function main() {
  const write = process.argv.includes("--write");
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { readCatalog } = await import("../src/lib/catalog/store");
  const { readBranchSettings } = await import("../src/lib/branches/store");
  const { db } = getServerFirebase();
  const [catalog, branches] = await Promise.all([readCatalog(), readBranchSettings()]);
  const plan = catalogMigrationPlan(catalog, branches.assignments);
  console.log(`Categories: ${plan.sections.length}. Sizes: ${plan.variants.length}. Assignments: ${plan.assignments.length}.`);
  if (!write) {
    console.log("Dry run only. Re-run with --write to save modes, category days, and assignment modes.");
    return;
  }
  const batch = db.batch();
  batch.set(db.doc("settings/menuSections"), { sections: plan.sections, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.doc("settings/shop"), { defaultPreorderLeadDays: plan.preorderLeadDays, featuredProductIds: plan.featuredProductIds.length ? plan.featuredProductIds : ["buko", "smores", "pecan"] }, { merge: true });
  for (const variant of plan.variants) {
    batch.set(db.doc(`products/${variant.productId}/variants/${variant.variantId}`), { orderMode: variant.orderMode, minLeadDays: variant.minLeadDays }, { merge: true });
  }
  const settings: BranchSettings = { ...branches, assignments: plan.assignments };
  batch.set(db.doc("settings/branches"), { ...settings, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  console.log("Catalogue migration saved. Product and size IDs were kept.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
