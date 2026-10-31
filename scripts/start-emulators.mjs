import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { emulatorPorts } from "./emulator-env.mjs";

const javaHomes = [
  "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
];

function javaWorks(command) {
  return spawnSync(command, ["-version"], { encoding: "utf8" }).status === 0;
}

function javaEnvironment() {
  const env = { ...process.env };
  const candidates = [env.JAVA_HOME, ...javaHomes].filter(Boolean);
  for (const home of candidates) {
    const command = join(home, "bin", "java");
    if (!existsSync(command) || !javaWorks(command)) continue;
    env.JAVA_HOME = home;
    env.PATH = `${join(home, "bin")}${delimiter}${env.PATH ?? ""}`;
    return env;
  }
  if (javaWorks("java")) return env;
  console.error("Firestore needs Java 21 or newer. Install it with: brew install openjdk");
  process.exit(1);
}

const configured = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")).emulators;
for (const name of Object.keys(emulatorPorts)) {
  const port = configured[name]?.port;
  if (port !== emulatorPorts[name]) {
    console.error(`firebase.json ${name} port is ${port ?? "missing"}, expected ${emulatorPorts[name]}.`);
    process.exit(1);
  }
}

console.log(`Makalipie emulators — UI http://127.0.0.1:${emulatorPorts.ui}  Auth ${emulatorPorts.auth}  Firestore ${emulatorPorts.firestore}  Storage ${emulatorPorts.storage}`);

const child = spawn("firebase", ["emulators:start", "--only", "auth,firestore,storage", "--project", "demo-makalipie"], { stdio: "inherit", env: javaEnvironment() });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
