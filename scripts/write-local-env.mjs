import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let output = "";
try {
  output = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
  console.error(stderr || "Could not read local Supabase status. Start it with npm run supabase:start.");
  process.exit(1);
}
const values = new Map();
for (const line of output.split("\n")) {
  const trimmed = line.trim().replace(/^export\s+/, "");
  const separator = trimmed.indexOf("=");
  if (separator === -1) continue;
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values.set(trimmed.slice(0, separator).trim(), value);
}

const url = values.get("API_URL") || values.get("SUPABASE_URL");
const publishableKey = values.get("PUBLISHABLE_KEY") || values.get("ANON_KEY") || values.get("SUPABASE_ANON_KEY");
const secretKey = values.get("SECRET_KEY") || values.get("SERVICE_ROLE_KEY") || values.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !publishableKey || !secretKey) {
  console.error("Could not read the local Supabase URL and keys. Start it with npm run supabase:start, then run this again.");
  process.exit(1);
}

writeFileSync(".env.local", `SUPABASE_URL=${url}\nSUPABASE_PUBLISHABLE_KEY=${publishableKey}\nSUPABASE_SECRET_KEY=${secretKey}\n`);
console.log("Wrote .env.local for local Supabase. This file is gitignored.");
