import { getServerFirebase } from "../src/lib/firebase/server";
import { FieldValue } from "firebase-admin/firestore";

async function main() {
  const emailIndex = process.argv.indexOf("--email");
  const email = process.argv[emailIndex + 1]?.trim();
  if (emailIndex === -1 || !email || !email.includes("@")) {
    throw new Error("Usage: npm run admin:bootstrap -- --email your-existing-auth-user@example.com");
  }
  const { auth, db } = getServerFirebase();
  const user = await auth.getUserByEmail(email);
  if (user.disabled) throw new Error("Enable this Firebase Auth account before making it the owner.");
  const marker = db.doc("privateSettings/ownerBootstrap");
  const profile = db.doc(`admins/${user.uid}`);
  await db.runTransaction(async (transaction) => {
    const [existingMarker, existingOwners, existingProfile] = await Promise.all([
      transaction.get(marker),
      transaction.get(db.collection("admins").where("role", "==", "owner").limit(1)),
      transaction.get(profile),
    ]);
    if (existingMarker.exists || !existingOwners.empty || existingProfile.exists) {
      throw new Error("Owner setup has already been performed, or this profile exists. No records were changed. Manage access through the trusted Firebase Console.");
    }
    transaction.create(profile, {
      email: user.email,
      displayName: user.displayName || "Owner",
      role: "owner",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(marker, { ownerUid: user.uid, createdAt: FieldValue.serverTimestamp() });
  });
  console.log("Owner access created. You can now sign in at /admin/login.");
}

main().catch((error) => {
  // Avoid dumping SDK error objects or credential details.
  if (error instanceof Error && (error.message.startsWith("Usage:") || error.message.startsWith("Owner setup") || error.message.startsWith("Enable this"))) {
    console.error(error.message);
  } else {
    console.error("Owner setup failed. Check your Firebase environment values, Firestore setup, and that the email exists in Firebase Authentication.");
  }
  process.exitCode = 1;
});
