import test from "node:test";
import assert from "node:assert/strict";
import { createOrderActionQueue, ORDER_UNDO_MS, type OrderAction } from "../src/components/admin/order-action-queue";

const action: OrderAction = { orderId: "one", orderNumber: "MP-1", updatedAt: "revision", status: "cancelled" };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("waits three seconds, deduplicates clicks, and cannot undo a dispatched action", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let finish!: () => void;
  const queue = createOrderActionQueue(async sent => { assert.deepEqual(sent, action); calls++; await new Promise<void>(resolve => { finish = resolve; }); });
  queue.schedule(action); queue.schedule(action);
  t.mock.timers.tick(ORDER_UNDO_MS - 1);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
  queue.undo(action.orderId);
  assert.equal(queue.getSnapshot()[0].phase, "saving");
  finish(); await flush();
  assert.equal(queue.getSnapshot().length, 0);
});

test("Undo cancels only its own order", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: string[] = [];
  const queue = createOrderActionQueue(async item => { sent.push(item.orderId); });
  queue.schedule(action); queue.schedule({ ...action, orderId: "two" });
  queue.undo("one");
  t.mock.timers.tick(ORDER_UNDO_MS); await flush();
  assert.deepEqual(sent, ["two"]);
});

test("cleanup cancels timers and aborts queued transport work; late responses stay discarded", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal!: AbortSignal;
  let finish!: () => void;
  let calls = 0;
  const queue = createOrderActionQueue(async (_, abort) => { calls++; signal = abort; await new Promise<void>(resolve => { finish = resolve; }); });
  queue.schedule(action);
  t.mock.timers.tick(ORDER_UNDO_MS);
  queue.schedule({ ...action, orderId: "two" });
  queue.clear();
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(ORDER_UNDO_MS);
  finish(); await flush();
  assert.equal(calls, 1);
  assert.deepEqual(queue.getSnapshot(), []);
  // Cleanup is reusable for React Strict Mode's effect remount.
  queue.schedule(action);
  assert.equal(queue.getSnapshot()[0].phase, "pending");
  queue.clear();
});

test("a rejected stale save surfaces its error without retrying", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const queue = createOrderActionQueue(async () => { calls++; throw new Error("Refresh this order before saving."); });
  queue.schedule(action);
  t.mock.timers.tick(ORDER_UNDO_MS); await flush();
  assert.equal(queue.getSnapshot()[0].phase, "error");
  assert.match(queue.getSnapshot()[0].error!, /Refresh/);
  t.mock.timers.tick(60000);
  assert.equal(calls, 1);
  queue.dismiss("one");
  assert.deepEqual(queue.getSnapshot(), []);
});
