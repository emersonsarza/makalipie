import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function firebaseSetupReady() {
  const emulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.ADMIN_APP_ORIGIN &&
    (emulator || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)),
  );
}

export function getServerFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase server configuration is missing.");
  if (projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error("Firebase browser and server project IDs must match.");
  }
  const emulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  if (emulator) {
    if (process.env.NODE_ENV === "production" || !projectId.startsWith("demo-") ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
        process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
        (process.env.FIREBASE_STORAGE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199")) {
      throw new Error("Emulators require development mode, a demo project, and local emulator hosts.");
    }
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST) {
    throw new Error("Remove emulator hosts when using a real Firebase project.");
  }

  const existing = getApps().find((app) => app.name === "makalipie-admin");
  const app = existing ?? initializeApp({
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    ...(emulator ? {} : {
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    }),
  }, "makalipie-admin");
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
