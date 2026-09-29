import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
Object.assign(process.env, emulatorEnv);

describe("pop-up visits", { concurrency: false }, () => {
  test("an order that names a pop-up id is refused", async (t) => {
    let reachable = false;
    try {
      const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
      reachable = probe.status > 0;
    } catch {
      reachable = false;
    }
    if (!reachable) {
      t.skip("Firestore emulator is not running");
      return;
    }
    const { getServerFirebase } = await import("../src/lib/firebase/server");
    const { db } = getServerFirebase();
    const { readPopupSettings, savePopupSettings } = await import("../src/lib/popups/store");
    const { submitOrder } = await import("../src/lib/orders/store");
    const { readPublicMenu } = await import("../src/lib/products/public");
    const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
    const { readScheduleSettings } = await import("../src/lib/scheduling/store");
    const { manilaDate } = await import("../src/lib/catalog/rules");
    const before = await db.doc("settings/popups").get();
    const menu = await readPublicMenu();
    const product = menu.catalog?.products.find((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0));
    const variant = product?.variants.find((item) => item.active && item.minLeadDays === 0);
    const date = addCalendarDays(manilaDate(), 3);
    const slot = slotsForDate(await readScheduleSettings(), "cebu", date, new Date())[0];
    if (!product || !variant || !slot) {
      t.skip("Demo catalog or Cebu slot is not ready");
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    const current = await readPopupSettings();
    try {
      await savePopupSettings({
        version: current.version,
        listings: [...current.listings.filter((item) => item.id !== "phase10-visit"), {
          id: "phase10-visit",
          name: "Phase 10 visit",
          address: "Temporary market",
          mapUrl: "",
          startDate: date,
          endDate: date,
          hours: "10:00 AM – 4:00 PM",
          items: ["Keylime"],
        }],
      }, "popups-integration");
      await assert.rejects(
        () => submitOrder({
          idempotencyKey,
          branchId: "phase10-visit",
          slotId: slot.id,
          name: "Popup Refusal",
          contact: "09170000000",
          notes: "",
          delivery: "pickup",
          address: "",
          payment: "bank",
          selection: { date, lines: [{ productId: product.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /visits/);
          assert.doesNotMatch(error.message, /sold out|full/i);
          return true;
        },
      );
      assert.equal((await db.doc(`orderIdempotency/${idempotencyKey}`).get()).exists, false);
    } finally {
      if (before.exists) await db.doc("settings/popups").set(before.data()!);
      else await db.doc("settings/popups").delete();
      const events = await db.collection("popupSettingsEvents").where("actorUid", "==", "popups-integration").get();
      await Promise.all(events.docs.map((doc) => doc.ref.delete()));
      const idempotency = await db.doc(`orderIdempotency/${idempotencyKey}`).get();
      if (idempotency.exists) {
        const orderId = String(idempotency.data()?.orderId ?? "");
        if (orderId) await db.doc(`orders/${orderId}`).delete();
        await idempotency.ref.delete();
      }
    }
  });
});
