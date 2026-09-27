import { emulatorEnv } from "./emulator-env.mjs";

Object.assign(process.env, emulatorEnv);

async function main() {
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { auth, db } = getServerFirebase();
  const email = "owner@example.test";
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password: "Makalipie-demo-only!", displayName: "Demo Owner" });
  }
  await db.doc(`admins/${user.uid}`).set({ email, displayName: "Demo Owner", role: "owner", active: true });
  console.log("Local emulator owner ready: owner@example.test / Makalipie-demo-only!");
}
main().catch(() => { console.error("Start the Auth and Firestore emulators before seeding."); process.exitCode = 1; });
