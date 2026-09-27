"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence } from "firebase/auth";

function clientConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

let authReady: Promise<ReturnType<typeof getAuth>> | undefined;

export function getBrowserAuth() {
  authReady ??= (async () => {
    const config = clientConfig();
    if (!config.apiKey || !config.projectId || !config.authDomain || !config.appId) {
      throw new Error("Firebase sign-in is not configured yet.");
    }
    const app = getApps().length ? getApp() : initializeApp(config);
    const auth = getAuth(app);
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
      if (!config.projectId.startsWith("demo-") || process.env.NODE_ENV === "production") {
        throw new Error("Emulators require a demo project and development mode.");
      }
      if (!auth.emulatorConfig) connectAuthEmulator(auth, "http://127.0.0.1:9099");
    }
    // Firebase tokens are only used to establish the server's HttpOnly session.
    await setPersistence(auth, inMemoryPersistence);
    return auth;
  })();
  return authReady;
}
