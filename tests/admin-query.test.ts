import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import { nextAdminBoundary } from "../src/components/admin/query-clock";
import { adminKey, adminQuery, createAdminQueryClient, invalidateAdmin, redactOrder } from "../src/components/admin/query-cache";
import { adminRequest, configureAdminTransport, OrderRequestError, retireAdminSession } from "../src/components/admin/orders-data";

const clients: ReturnType<typeof createAdminQueryClient>[] = [];
function client() { const value = createAdminQueryClient(); clients.push(value); return value; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
afterEach(() => { clients.splice(0).forEach(client => client.clear()); configureAdminTransport(); retireAdminSession(); mock.restoreAll(); });

test("query keys isolate account, queue, filters, pages, dates and previews", () => {
  assert.deepEqual(adminKey("a", "/api/admin/orders?page=2&queue=cebu"), adminKey("a", "/api/admin/orders?queue=cebu&page=2"));
  const inputs = [
    ["a", "/api/admin/orders?page=1"], ["b", "/api/admin/orders?page=1"], ["a", "/api/admin/orders?page=2"],
    ["a", "/api/admin/orders?queue=cebu"], ["a", "/api/admin/orders?queue=drop"], ["a", "/api/admin/orders?status=pending"],
    ["a", "/api/admin/lineup?date=2026-11-13"], ["a", "/api/admin/lineup?date=2026-11-14"],
    ["a", "/api/admin/preview?theme=original"], ["a", "/api/admin/preview?theme=christmas"],
  ];
  assert.equal(new Set(inputs.map(([account, url]) => JSON.stringify(adminKey(account, url)))).size, inputs.length);
});

test("deduplicates concurrent readers and revalidates cached data on the next read", async () => {
  const c = client(); let requests = 0;
  mock.method(globalThis, "fetch", async () => Response.json({ revision: ++requests }));
  const options = adminQuery<{ revision: number }>("owner", "/api/admin/catalog");
  const [a, b] = await Promise.all([c.fetchQuery(options), c.fetchQuery(options)]);
  assert.deepEqual(a, b); assert.equal(requests, 1);
  assert.equal((await c.fetchQuery(options)).revision, 2);
  assert.equal(c.getDefaultOptions().queries?.gcTime, 300_000);
  assert.equal(c.getDefaultOptions().queries?.staleTime, 0);
});

test("transport serializes dispatch and cancels queued reads without aborting cookie rotation", async () => {
  const first = deferred<Response>(); const urls: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    urls.push(url); assert.equal(init.signal, undefined); assert.equal(init.cache, "no-store");
    return urls.length === 1 ? first.promise : Response.json({ ok: true });
  });
  const inflight = new AbortController(); const queued = new AbortController();
  const a = adminRequest("/one", { signal: inflight.signal });
  const b = adminRequest("/two", { signal: queued.signal });
  const outcomes = Promise.allSettled([a, b]);
  await tick(); assert.deepEqual(urls, ["/one"]);
  inflight.abort(); queued.abort(); first.resolve(Response.json({ ok: true }));
  const results = await outcomes;
  assert.ok(results.every(result => result.status === "rejected" && result.reason.name === "AbortError"));
  assert.deepEqual(urls, ["/one"]);
  await adminRequest("/three"); assert.deepEqual(urls, ["/one", "/three"]);
});

test("retired session responses cannot repopulate a cleared cache", async () => {
  const c = client(); const response = deferred<Response>();
  mock.method(globalThis, "fetch", () => response.promise);
  const options = adminQuery("old-owner", "/api/admin/catalog");
  const request = c.fetchQuery(options).catch(error => error);
  await tick(); retireAdminSession(); await c.cancelQueries(); c.clear();
  response.resolve(Response.json({ secret: "old" })); await request; await tick();
  assert.equal(c.getQueryCache().getAll().length, 0);
});

test("authorization failure expires the session; incorrect current password does not", async () => {
  let expired = 0;
  configureAdminTransport({ unauthorized: () => { expired++; }, mutate: (_url, _init, run) => run() });
  mock.method(globalThis, "fetch", async () => Response.json({ error: "unauthenticated" }, { status: 401 }));
  await assert.rejects(adminRequest("/api/admin/catalog"), OrderRequestError); assert.equal(expired, 1);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid_credentials" }, { status: 401 }));
  await assert.rejects(adminRequest("/api/admin/session/password", { method: "POST" }), OrderRequestError); assert.equal(expired, 1);
});

test("only transient read errors retry and writes never retry", () => {
  const c = client(); const retry = c.getDefaultOptions().queries!.retry as (count: number, error: Error) => boolean;
  assert.equal(retry(0, new OrderRequestError(503, {})), true);
  assert.equal(retry(1, new OrderRequestError(503, {})), false);
  for (const status of [400, 401, 403, 409]) assert.equal(retry(0, new OrderRequestError(status, {})), false);
  assert.equal(retry(0, new DOMException("cancelled", "AbortError")), false);
  assert.equal(c.getDefaultOptions().mutations?.retry, false);
  assert.equal(c.getDefaultOptions().mutations?.networkMode, "always");
});

test("events invalidate dependent inactive data without fetching it", async () => {
  const c = client();
  const urls = ["/api/admin/catalog", "/api/admin/orders", "/api/admin/lineup", "/api/admin/drops", "/api/admin/drops/preview?slug=a", "/api/admin/backups"];
  urls.forEach(url => c.setQueryData(adminKey("owner", url), {}));
  await invalidateAdmin(c, "orders");
  for (const url of urls) assert.equal(c.getQueryState(adminKey("owner", url))?.isInvalidated, !["/api/admin/catalog", "/api/admin/backups"].includes(url));
});

test("invalidation cancels an older read and awaits fresh active data", async () => {
  const c = client(); const old = deferred<Response>(); let requests = 0;
  mock.method(globalThis, "fetch", async () => ++requests === 1 ? old.promise : Response.json({ revision: 2 }));
  const options = adminQuery<{ revision: number }>("owner", "/api/admin/catalog");
  const observer = new QueryObserver(c, options); const unsubscribe = observer.subscribe(() => {});
  await tick(); const reconciled = invalidateAdmin(c, "catalog");
  old.resolve(Response.json({ revision: 1 })); await reconciled;
  assert.equal(c.getQueryData<{ revision: number }>(options.queryKey)?.revision, 2);
  unsubscribe();
});

test("refresh failure keeps cached content and exposes an error without failing the successful write", async () => {
  const c = client(); c.setDefaultOptions({ queries: { retry: false } });
  const options = adminQuery("owner", "/api/admin/catalog"); c.setQueryData(options.queryKey, { revision: 1 });
  mock.method(globalThis, "fetch", async () => Response.json({ error: "unavailable" }, { status: 503 }));
  const observer = new QueryObserver(c, options); const unsubscribe = observer.subscribe(() => {});
  await invalidateAdmin(c, "catalog");
  assert.deepEqual(c.getQueryData(options.queryKey), { revision: 1 });
  assert.equal(c.getQueryState(options.queryKey)?.status, "error"); unsubscribe();
});

test("terminal orders remove personal details from every cached representation", () => {
  const c = client(); const order = { id: "1", orderNumber: "MP1", status: "pending", customerName: "Private", notes: "Private", customerPhone: "Private", deliveryAddress: "Private" };
  c.setQueryData(adminKey("owner", "/api/admin/orders?page=1"), { orders: [order] });
  c.setQueryData(adminKey("owner", "/api/admin/orders/1"), order);
  redactOrder(c, "1");
  assert.ok(!JSON.stringify(c.getQueryCache().getAll().map(q => q.state.data)).includes("Private"));
  c.setQueryData(adminKey("owner", "/api/admin/orders/1"), { ...order, status: "completed" });
  assert.ok(!JSON.stringify(c.getQueryCache().getAll().map(q => q.state.data)).includes("Private"));
});

test("inactive queries are garbage collected", async () => {
  const c = client();
  await c.fetchQuery({ queryKey: ["expiry"], queryFn: async () => 1, gcTime: 5 });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(c.getQueryData(["expiry"]), undefined);
});

test("clock refreshes at Manila midnight and the next schedule or drop boundary", () => {
  const now = Date.parse("2026-11-13T08:00:00+08:00");
  assert.equal(nextAdminBoundary([], now), Date.parse("2026-11-14T00:00:00+08:00"));
  assert.equal(nextAdminBoundary([{ schedules: [{ opens: "09:00", cutoff: "15:00" }] }], now), Date.parse("2026-11-13T09:00:00+08:00"));
  const data = [{ dates: [{ date: "2026-11-13", orderingOpens: "07:00", orderingCutoff: "08:30", pickup: { ends: "10:00" } }] }];
  assert.equal(nextAdminBoundary(data, now), Date.parse("2026-11-13T08:30:00+08:00"));
  assert.equal(nextAdminBoundary(data, Date.parse("2026-11-13T08:30:00+08:00")), Date.parse("2026-11-13T10:00:00+08:00"));
});
