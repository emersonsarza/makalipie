import { spawn } from "node:child_process";
import { emulatorEnv } from "./emulator-env.mjs";

const args = process.argv.slice(2);
const flag = args.findIndex((arg) => arg === "-p" || arg === "--port");
const inline = args.find((arg) => arg.startsWith("--port="));
const port = flag !== -1 ? args[flag + 1] : inline?.slice("--port=".length) ?? process.env.PORT;
const env = { ...process.env };

if (port === "3001") {
  Object.assign(env, emulatorEnv, { ADMIN_APP_ORIGIN: "http://localhost:3001" });
  // Keep these present so .env.local cannot put the live project credentials back.
  env.FIREBASE_CLIENT_EMAIL = "";
  env.FIREBASE_PRIVATE_KEY = "";
  env.GOOGLE_APPLICATION_CREDENTIALS = "";
  console.log("Port 3001 is using the local Firebase emulators (demo-makalipie), not the live project.");
}

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...args], { stdio: "inherit", env });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
