import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseSetupReady, getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import { defaultPopupSettings, parsePopupSettings, type PopupSettings } from "./schema";

export async function readPopupSettings(): Promise<PopupSettings> {
  if (!firebaseSetupReady()) return defaultPopupSettings();
  const doc = await getServerFirebase().db.doc("settings/popups").get();
  if (!doc.exists) return defaultPopupSettings();
  const { updatedAt: _at, updatedBy: _by, ...settings } = doc.data()!;
  void _at;
  void _by;
  return parsePopupSettings(settings);
}

export async function savePopupSettings(input: PopupSettings, uid: string) {
  const settings = parsePopupSettings(input);
  const { db } = getServerFirebase();
  await db.runTransaction(async (tx) => {
    const ref = db.doc("settings/popups");
    const branchRef = db.doc("settings/branches");
    const [existing, branches] = await Promise.all([tx.get(ref), tx.get(branchRef)]);
    if ((existing.data()?.version ?? 0) !== settings.version) {
      throw new ProductError(409, "Pop-ups changed in another editor. Reload before saving again.");
    }
    const branchIds = new Set(
      (Array.isArray(branches.data()?.branches) ? branches.data()!.branches : [])
        .map((branch: { id?: unknown }) => String(branch?.id ?? "")),
    );
    if (settings.listings.some((listing) => branchIds.has(listing.id))) {
      throw new ProductError(400, "A pop-up cannot use a main branch id.");
    }
    tx.set(ref, { ...settings, version: settings.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    tx.create(db.collection("popupSettingsEvents").doc(), {
      actorUid: uid,
      at: FieldValue.serverTimestamp(),
      before: existing.exists ? existing.data() : null,
      after: settings,
    });
  });
}
