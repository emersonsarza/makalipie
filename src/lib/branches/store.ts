import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseSetupReady, getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import { defaultBranchSchedule, defaultScheduleSettings, scheduleSettingsSchema } from "../scheduling/schema";
import { defaultBranchSettings, parseBranchSettings, type BranchSettings } from "./schema";

export async function readBranchSettings(): Promise<BranchSettings> {
  if (!firebaseSetupReady()) return defaultBranchSettings();
  const doc = await getServerFirebase().db.doc("settings/branches").get();
  if (!doc.exists) return defaultBranchSettings();
  const { updatedAt: _at, updatedBy: _by, ...settings } = doc.data()!;
  void _at; void _by;
  return parseBranchSettings(settings);
}

export async function saveBranchSettings(input: BranchSettings, uid: string) {
  const settings = parseBranchSettings(input);
  const { db } = getServerFirebase();
  await db.runTransaction(async (tx) => {
    const ref = db.doc("settings/branches");
    const scheduleRef = db.doc("settings/orderingSchedule");
    const [existing, initialized, scheduleSnap] = await Promise.all([tx.get(ref), tx.get(db.doc("privateSettings/catalogV2")), tx.get(scheduleRef)]);
    if (!initialized.exists) throw new ProductError(409, "Set up your catalog options before saving branches.");
    if ((existing.data()?.version ?? 0) !== settings.version) throw new ProductError(409, "Branch settings changed in another editor. Reload before saving again.");
    const productIds = [...new Set(settings.assignments.map((a) => a.productId))];
    // Reject path injection before building document references.
    if (settings.assignments.some((a) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.productId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.variantId))) throw new ProductError(400, "Invalid product or size.");
    const products = await Promise.all(productIds.map((id) => tx.get(db.doc(`products/${id}`))));
    const variants = await Promise.all(settings.assignments.map((a) => tx.get(db.doc(`products/${a.productId}/variants/${a.variantId}`))));
    if (products.some((p) => !p.exists) || variants.some((v) => !v.exists)) throw new ProductError(409, "The catalog changed. Reload before assigning products.");
    settings.assignments.forEach((a, i) => {
      if (a.mode === "regular" && variants[i].data()!.minLeadDays > 0) throw new ProductError(400, "Sizes needing preparation days must use Pre-order. Update preparation days in Catalog first if needed.");
    });
    tx.set(ref, { ...settings, version: settings.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    tx.create(db.collection("branchSettingsEvents").doc(), { actorUid: uid, at: FieldValue.serverTimestamp(), before: existing.exists ? existing.data() : null, after: settings });
    const savedIds = new Set(settings.branches.map((branch) => branch.id));
    const { updatedAt: _at, updatedBy: _by, ...scheduleData } = scheduleSnap.exists ? scheduleSnap.data()! : { ...defaultScheduleSettings(), version: 0 };
    void _at; void _by;
    const previous = scheduleSettingsSchema.parse(scheduleData);
    const nextBranches = { ...previous.branches };
    for (const id of Object.keys(nextBranches)) if (!savedIds.has(id)) delete nextBranches[id];
    for (const branch of settings.branches) if (!nextBranches[branch.id]) nextBranches[branch.id] = defaultBranchSchedule();
    const sameKeys = Object.keys(previous.branches).sort().join("\0") === Object.keys(nextBranches).sort().join("\0");
    if (!sameKeys) tx.set(scheduleRef, { ...previous, branches: nextBranches, version: previous.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
  });
}
