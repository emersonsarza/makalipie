import assert from "node:assert/strict";
import test from "node:test";
import { dueHoldConstraints } from "../src/lib/orders/expiry";
import { forget, remember } from "../src/lib/public-cache";

test("a second read reuses the cached value until forget", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return "menu";
  };
  assert.equal(await remember("cache-test-menu", load), "menu");
  assert.equal(await remember("cache-test-menu", load), "menu");
  assert.equal(calls, 1);
  forget("cache-test-menu");
  assert.equal(await remember("cache-test-menu", load), "menu");
  assert.equal(calls, 2);
  forget("cache-test-menu");
});

test("a failed load is not kept", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    throw new Error("quota");
  };
  await assert.rejects(() => remember("cache-test-fail", load), /quota/);
  await assert.rejects(() => remember("cache-test-fail", load), /quota/);
  assert.equal(calls, 2);
});

test("forget drops a dated stock key", async () => {
  let calls = 0;
  const key = "stock:2026-10-23:2026-11-22";
  await remember(key, async () => {
    calls += 1;
    return 1;
  });
  forget("stock");
  await remember(key, async () => {
    calls += 1;
    return 1;
  });
  assert.equal(calls, 2);
  forget("stock");
});

test("expireDueHolds queries requested orders whose deadline has passed", () => {
  const now = new Date("2026-10-23T02:00:00.000Z");
  assert.deepEqual(dueHoldConstraints(now), {
    status: "requested",
    deadlineMax: "2026-10-23T02:00:00.000Z",
  });
});
