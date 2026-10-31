/** Makalipie-only emulator ports, off the Firebase defaults so another project can keep 4000/8080/9099/9199. */
export const emulatorPorts = {
  auth: 19099,
  firestore: 18080,
  storage: 19199,
  ui: 14000,
  hub: 14400,
  logging: 14500,
};

const localHost = (port) => `127.0.0.1:${port}`;

export const emulatorEnv = {
  NODE_ENV: "development",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-makalipie.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-makalipie",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-makalipie.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: localHost(emulatorPorts.auth),
  NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST: localHost(emulatorPorts.storage),
  FIREBASE_PROJECT_ID: "demo-makalipie",
  FIREBASE_AUTH_EMULATOR_HOST: localHost(emulatorPorts.auth),
  FIRESTORE_EMULATOR_HOST: localHost(emulatorPorts.firestore),
  FIREBASE_STORAGE_EMULATOR_HOST: localHost(emulatorPorts.storage),
  ADMIN_APP_ORIGIN: "http://localhost:3000",
};
