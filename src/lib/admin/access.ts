import { adminProfileSchema, type AdminIdentity } from "./schemas";

export class AdminAccessError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "AdminAccessError";
  }
}

export function authorizeAdmin(uid: string, profile: unknown): AdminIdentity {
  const parsed = adminProfileSchema.safeParse(profile);
  if (!parsed.success || !parsed.data.active || (parsed.data.role !== "owner" && parsed.data.role !== "staff")) {
    throw new AdminAccessError(403, "This account does not have active access.");
  }
  return { uid, ...parsed.data };
}

export function authorizeOwner(uid: string, profile: unknown): AdminIdentity {
  const parsed = adminProfileSchema.safeParse(profile);
  if (!parsed.success || !parsed.data.active || parsed.data.role !== "owner") {
    throw new AdminAccessError(403, "This account does not have active owner access.");
  }
  return { uid, ...parsed.data };
}

export function assertRecentSignIn(authTime: number, now = Date.now()) {
  const age = now / 1000 - authTime;
  if (!Number.isFinite(age) || age > 300 || age < -60) {
    throw new AdminAccessError(401, "Please sign in again to continue.");
  }
}

// A fixed, configured origin avoids trusting an attacker-controlled Host header.
export function isAllowedMutationOrigin(request: Request, configuredOrigin: string) {
  try {
    const expected = new URL(configuredOrigin).origin;
    const supplied = request.headers.get("origin");
    return supplied === expected && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch {
    return false;
  }
}

// Future order endpoints must enforce this against the saved order branch.
// Catalog and branch configuration continue to require owner access.
export function authorizeBranch(uid: string, profile: unknown, branchId: string): AdminIdentity {
  const parsed = adminProfileSchema.safeParse(profile);
  if (!parsed.success || !parsed.data.active ||
      (parsed.data.role !== "owner" && !parsed.data.branchIds.includes(branchId))) {
    throw new AdminAccessError(403, "This account cannot access this branch.");
  }
  return { uid, ...parsed.data };
}
