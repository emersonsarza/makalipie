import { emulatorEnv } from "./emulator-env.mjs";

Object.assign(process.env, emulatorEnv);
const { seedAccount } = await import("./seed");
await seedAccount();
