import { spawn } from "node:child_process";
import { emulatorEnv } from "./emulator-env.mjs";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3001"], {
  stdio: "inherit",
  env: { ...process.env, ...emulatorEnv, ADMIN_APP_ORIGIN: "http://localhost:3001" },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
