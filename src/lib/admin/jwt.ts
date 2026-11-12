import { createRemoteJWKSet, jwtVerify } from "jose";
import { readSupabaseEnv } from "./env";

type AccessClaims = { sub: string; email: string; exp: number };
type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: "invalid" | "unavailable" };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function authJwks() {
  if (!jwks) {
    const { url } = readSupabaseEnv();
    jwks = createRemoteJWKSet(new URL(`${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, authJwks(), {
      algorithms: ["ES256", "RS256"],
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return { ok: false, reason: "invalid" };
    return {
      ok: true,
      claims: {
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
        exp: payload.exp,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/fetch|network|jwks|timeout|ECONN/i.test(message)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "invalid" };
  }
}
