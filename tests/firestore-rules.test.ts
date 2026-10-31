import { readFileSync } from "node:fs";
import test from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { emulatorPorts } from "../scripts/emulator-env.mjs";

test("browser clients cannot read private data or grant owner access", async () => {
  const environment = await initializeTestEnvironment({ projectId: "demo-makalipie", firestore: { host: "127.0.0.1", port: emulatorPorts.firestore, rules: readFileSync("firestore.rules", "utf8") } });
  try {
    for (const client of [environment.unauthenticatedContext(), environment.authenticatedContext("owner-test", { role: "owner" })]) {
      const db = client.firestore();
      for (const path of ["admins/owner-test", "orders/test", "privateSettings/alerts", "counters/orders"]) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { active: true, role: "owner" }));
      }
    }
  } finally { await environment.cleanup(); }
});
