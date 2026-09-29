import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
import type { Catalog } from "../src/lib/catalog/schema";
import type { BranchSettings } from "../src/lib/branches/schema";
import { currentAssignments } from "../src/lib/branches/schema";
import { defaultScheduleSettings } from "../src/lib/scheduling/schema";
import { addCalendarDays } from "../src/lib/scheduling/rules";
import { manilaDate } from "../src/lib/catalog/rules";
Object.assign(process.env, emulatorEnv);
const origin = process.env.BRANCH_TEST_ORIGIN || "http://localhost:3002";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Use a local demo preview only.");

test("branch settings persist, reject stale/unauthorized saves, and constrain customer previews", async (t) => {
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db, auth, app } = getServerFirebase();
  assert.equal(app.options.projectId, "demo-makalipie");
  const before = await db.doc("settings/branches").get();
  const user = await auth.createUser({ email: `branch-${randomUUID()}@example.test`, password: "Branches-demo-only!" });
  await db.doc(`admins/${user.uid}`).set({ role: "owner", active: true, email: user.email });
  const scheduleRef=db.doc("settings/orderingSchedule"), scheduleBefore=await scheduleRef.get();
  const fixture=defaultScheduleSettings(); fixture.branches.cebu.enabled=true; fixture.branches.manila.enabled=true;
  await scheduleRef.set({...fixture,updatedBy:user.uid});
  let latestVersion: number | undefined;
  try {
    const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "Branches-demo-only!", returnSecureToken: true }) });
    const { idToken } = await login.json();
    const session = await fetch(`${origin}/api/admin/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    assert.equal(session.status, 200, await session.clone().text());
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    const get = () => fetch(`${origin}/api/admin/branches`, { headers: { Cookie: cookie } });
    const save = (body: unknown, requestOrigin = origin) => fetch(`${origin}/api/admin/branches`, { method: "POST", headers: { Cookie: cookie, Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const first = await get(); assert.equal(first.status, 200);
    const { settings, catalog }: { settings: BranchSettings; catalog: Catalog } = await first.json();
    assert.equal(catalog.initialized, true, "Initialize demo catalog before running this test; existing products are preserved.");
    const assignments = currentAssignments(catalog, settings);
    const regular = catalog.products.flatMap((p: { id: string; active: boolean; variants: Array<{ id: string; active: boolean; minLeadDays: number }> }) => p.variants.filter((v) => p.active && v.active && v.minLeadDays === 0).map((v) => ({ productId: p.id, variantId: v.id })));
    assert.ok(regular.length >= 2);
    const shared = regular[0]; const cebuOnly = regular[1];
    const payload: BranchSettings = { ...settings, defaultBranch: "manila", assignments: assignments.map((a) => ({ ...a, branchIds: a.productId === shared.productId && a.variantId === shared.variantId ? ["cebu", "manila"] : ["cebu"], mode: "regular" })) };
    // Preserve preparation-required variants as preorders.
    payload.assignments.forEach((a) => { const product = catalog.products.find((p) => p.id === a.productId); assert.ok(product); const variant = product.variants.find((v) => v.id === a.variantId); assert.ok(variant); if (variant.minLeadDays > 0) a.mode = "preorder"; });
    await t.test("authentication and mutation origin", async () => {
      assert.equal((await fetch(`${origin}/api/admin/branches`)).status, 401);
      assert.equal((await save(payload, "https://evil.example")).status, 403);
    });
    await t.test("save, persisted reload, conflict protection and audit event", async () => {
      const result = await save(payload); assert.equal(result.status, 200, await result.clone().text());
      const saved = await result.json(); latestVersion = saved.settings.version;
      assert.equal(saved.settings.defaultBranch, "manila");
      assert.equal((await (await get()).json()).settings.version, latestVersion);
      assert.equal((await save(payload)).status, 409);
      const events = await db.collection("branchSettingsEvents").where("actorUid", "==", user.uid).get();
      assert.equal(events.size, 1);
    });
    await t.test("trusted quote rejects items outside branch and excludes preorder", async () => {
      const preview = (line: typeof shared, branchId: string, catalogMode?: "regular" | "preorder") => fetch(`${origin}/api/catalog/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId, catalogMode, date: addCalendarDays(manilaDate(),2), slotId:"10:00", lines: [{ ...line, quantity: 1, addons: [] }], addons: [] }) });
      assert.equal((await preview(shared, "manila")).status, 200);
      assert.equal((await preview(cebuOnly, "manila")).status, 400);
      assert.equal((await preview(cebuOnly, "cebu")).status, 200);
      assert.equal((await preview(shared, "popup")).status, 200);
      const hidden = structuredClone((await (await get()).json()).settings) as BranchSettings;
      hidden.branches = hidden.branches.map((branch) => branch.id === "manila" ? { ...branch, visible: false } : branch);
      hidden.defaultBranch = "manila";
      const hiddenSave = await save(hidden);
      assert.equal(hiddenSave.status, 200, await hiddenSave.clone().text());
      const hiddenSettings = (await hiddenSave.json()).settings as BranchSettings;
      latestVersion = hiddenSettings.version;
      assert.equal(hiddenSettings.defaultBranch, "cebu");
      assert.equal(hiddenSettings.branches.find((branch) => branch.id === "manila")?.visible, false);
      assert.equal((await preview(cebuOnly, "manila")).status, 200);
      const current = (await (await get()).json()).settings;
      current.assignments = current.assignments.map((a: {productId:string;variantId:string;mode:string}) => a.productId === shared.productId && a.variantId === shared.variantId ? {...a, mode:"preorder"} : a);
      const result = await save(current); assert.equal(result.status, 200); latestVersion = (await result.json()).settings.version;
      assert.equal((await preview(shared, "manila", "regular")).status, 400);
      assert.equal((await preview(shared, "manila", "preorder")).status, 200);
    });
    await t.test("revoked owner cannot mutate settings", async () => {
      await db.doc(`admins/${user.uid}`).update({active:false});
      assert.equal((await save({...payload,version:latestVersion})).status,403);
    });
  } finally {
    await db.runTransaction(async tx=>{const current=await tx.get(scheduleRef); if(current.data()?.updatedBy===user.uid){if(scheduleBefore.exists)tx.set(scheduleRef,scheduleBefore.data()!);else tx.delete(scheduleRef);}});
    // Restore only our settings write; never overwrite a concurrent editor.
    await db.runTransaction(async tx => {
      const ref=db.doc("settings/branches"); const current=await tx.get(ref);
      if(latestVersion !== undefined && current.data()?.version === latestVersion && current.data()?.updatedBy === user.uid) {
        if(before.exists) tx.set(ref,before.data()!); else tx.delete(ref);
      }
    });
    const events=await db.collection("branchSettingsEvents").where("actorUid","==",user.uid).get();
    for(const event of events.docs) await event.ref.delete();
    await db.doc(`admins/${user.uid}`).delete(); await auth.deleteUser(user.uid);
  }
});
