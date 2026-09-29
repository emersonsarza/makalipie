import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseSetupReady, getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import { defaultScheduleSettings, scheduleSettingsSchema, type ScheduleSettings } from "./schema";
export async function readScheduleSettings(): Promise<ScheduleSettings> {
  if (!firebaseSetupReady()) return defaultScheduleSettings();
  const doc = await getServerFirebase().db.doc("settings/orderingSchedule").get();
  if (!doc.exists) return defaultScheduleSettings();
  const { updatedAt: _at, updatedBy: _by, ...data } = doc.data()!; void _at; void _by;
  return scheduleSettingsSchema.parse(data);
}
export async function saveScheduleSettings(input: ScheduleSettings, uid: string) {
  const settings = scheduleSettingsSchema.parse(input);
  const { db } = getServerFirebase();
  await db.runTransaction(async (tx) => {
    const ref = db.doc("settings/orderingSchedule"), existing = await tx.get(ref);
    if ((existing.data()?.version ?? 0) !== settings.version) throw new ProductError(409, "The schedule changed in another editor. Reload before saving again.");
    tx.set(ref, { ...settings, version: settings.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    tx.create(db.collection("scheduleSettingsEvents").doc(), { actorUid: uid, at: FieldValue.serverTimestamp(), before: existing.exists ? existing.data() : null, after: settings });
  });
}
