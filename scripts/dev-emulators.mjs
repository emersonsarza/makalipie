import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["scripts/dev.mjs", "--port", "3001"], { stdio: "inherit" });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
