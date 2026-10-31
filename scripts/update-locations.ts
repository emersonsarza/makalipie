/** Targeted settings update. Never resets catalog, schedules, accounts or orders. */
import { FieldValue } from "firebase-admin/firestore";
import { emulatorEnv } from "./emulator-env.mjs";
import { seedPopups, seedBranchSettings } from "../src/lib/catalog/seed-data";
import { cleanLocationBranches } from "../src/lib/popups/locations";
import { parseBranchSettings } from "../src/lib/branches/schema";
import { parsePopupSettings } from "../src/lib/popups/schema";

async function main() {
if (process.argv.includes("--emulator")) Object.assign(process.env, emulatorEnv);
const { getServerFirebase } = await import("../src/lib/firebase/server");
const { db } = getServerFirebase();
await db.runTransaction(async tx => {
  const branchRef = db.doc("settings/branches"), popupRef = db.doc("settings/popups");
  const [branchDoc, popupDoc] = await Promise.all([tx.get(branchRef), tx.get(popupRef)]);
  if (!branchDoc.exists) throw new Error("Branch settings are missing. Initialize branch settings first.");
  const { updatedAt: _at, updatedBy: _by, ...rawBranches } = branchDoc.data()!;
  const branches = parseBranchSettings(rawBranches);
  const cebu = seedBranchSettings.branches[0];
  const nextBranches = cleanLocationBranches(branches.branches).map(branch => branch.id === "cebu" ? { ...branch, address: branch.address || cebu.address, mapUrl: branch.mapUrl || cebu.mapUrl, hoursLabel: branch.hoursLabel || cebu.hoursLabel } : branch);
  if (JSON.stringify(nextBranches) !== JSON.stringify(branches.branches) || branches.defaultBranch !== "cebu") {
    tx.update(branchRef, { branches: nextBranches, defaultBranch: "cebu", version: branches.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: "location-update" });
  }
  const { updatedAt: _pat, updatedBy: _pby, ...rawPopups } = popupDoc.data() ?? { version: 0, listings: [] };
  const popups = parsePopupSettings(rawPopups);
  const listings = [...popups.listings];
  for (const sample of seedPopups.listings) {
    const index = listings.findIndex(p => p.id === sample.id);
    if (index < 0) listings.push(sample);
    else listings[index] = { ...listings[index], name: sample.name, address: sample.address, mapUrl: sample.mapUrl };
  }
  parsePopupSettings({ ...popups, listings });
  if (JSON.stringify(listings) !== JSON.stringify(popups.listings)) {
    tx.set(popupRef, { ...popups, listings, version: popups.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: "location-update" }, { merge: true });
  }
  void _at; void _by; void _pat; void _pby;
});
console.log("Location settings updated; catalog and orders preserved.");

}
void main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
