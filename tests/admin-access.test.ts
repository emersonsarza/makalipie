import assert from "node:assert/strict";
import test from "node:test";
import { AdminAccessError, authorizeAdmin, authorizeBranch, assertRecentSignIn, authorizeOwner, isAllowedMutationOrigin } from "../src/lib/admin/access";
import { businessDateSchema, moneySchema, sessionRequestSchema, variantSchema } from "../src/lib/admin/schemas";

const owner = { email: "owner@example.test", role: "owner", active: true };
test("only valid active owner profiles can access Part 1", () => {
  assert.equal(authorizeOwner("uid", owner).uid, "uid");
  for (const profile of [undefined, null, {}, { ...owner, role: "staff" }, { ...owner, active: false }, { ...owner, active: "true" }, { ...owner, role: "admin" }]) {
    assert.throws(() => authorizeOwner("uid", profile), AdminAccessError);
  }
});
test("sessions require a recent sign-in, including after token refresh", () => {
  const now = 1_800_000_000_000;
  assert.doesNotThrow(() => assertRecentSignIn(now / 1000 - 299, now));
  for (const timestamp of [now / 1000 - 301, now / 1000 + 61, NaN]) {
    assert.throws(() => assertRecentSignIn(timestamp, now), AdminAccessError);
  }
});
test("mutations reject absent, forged, sibling-domain, and cross-site origins", () => {
  const origin = "https://admin.makalipie.com";
  const make = (value?: string, site?: string) => new Request(`${origin}/api/admin/session`, { headers: { ...(value ? { origin: value } : {}), ...(site ? { "sec-fetch-site": site } : {}) } });
  assert.equal(isAllowedMutationOrigin(make(origin), origin), true);
  for (const request of [make(), make("null"), make("https://makalipie.com"), make("https://evil.example"), make(origin, "cross-site")]) {
    assert.equal(isAllowedMutationOrigin(request, origin), false);
  }
  assert.equal(isAllowedMutationOrigin(make(origin), ""), false);
});
test("session payload cannot inject a role or exceed token bounds", () => {
  assert.equal(sessionRequestSchema.safeParse({ idToken: "token", role: "owner" }).success, false);
  assert.equal(sessionRequestSchema.safeParse({ idToken: "x".repeat(16001) }).success, false);
});
test("shared values reject invalid dates, fractions, and quote-required zero prices", () => {
  assert.equal(businessDateSchema.safeParse("2026-02-30").success, false);
  assert.equal(moneySchema.safeParse(12.5).success, false);
  assert.equal(moneySchema.safeParse(-1).success, false);
  assert.equal(variantSchema.safeParse({ label: "Whole", pricingMode: "quote_required", priceCentavos: 0, minLeadDays: 1, active: true, sortOrder: 0 }).success, false);
});

test("active staff can sign in without gaining owner settings access", () => {
  const staff = { email: "staff@example.test", role: "staff" as const, active: true, branchIds: ["cebu"] };
  assert.equal(authorizeAdmin("staff", staff).role, "staff");
  assert.equal(authorizeAdmin("owner", owner).role, "owner");
  assert.throws(() => authorizeAdmin("staff", { ...staff, active: false }), AdminAccessError);
  assert.throws(() => authorizeOwner("staff", staff), AdminAccessError);
});
test("branch order authorization denies unassigned, other-branch and inactive staff", () => {
  const staff = { email: "staff@example.test", role: "staff", active: true, branchIds: ["cebu"] };
  assert.equal(authorizeBranch("staff", staff, "cebu").uid, "staff");
  assert.throws(() => authorizeBranch("staff", staff, "manila"), AdminAccessError);
  assert.throws(() => authorizeBranch("staff", { ...staff, branchIds: [] }, "cebu"), AdminAccessError);
  assert.throws(() => authorizeBranch("staff", { ...staff, active: false }, "cebu"), AdminAccessError);
  assert.equal(authorizeBranch("owner", owner, "manila").role, "owner");
  assert.throws(() => authorizeOwner("staff", staff), AdminAccessError);
});
