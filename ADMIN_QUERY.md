# Admin query cache

Admin server data uses TanStack Query v5. The public shop keeps its existing data flow.

## Freshness contract

- One memory-only QueryClient belongs to the authenticated admin shell. Account-scoped keys include the endpoint and sorted request parameters. Nothing is persisted to browser storage.
- Data has zero stale time, and inactive entries expire after five minutes. Mount, browser focus, reconnect, successful writes, and private realtime events revalidate relevant data. Cached content remains visible with refresh/error feedback.
- Reads retry one transient failure. Writes never retry or wait for an offline connection. HTTP requests remain `no-store`.
- Owner requests dispatch serially, including across tabs where Web Locks is available. Cancellation skips queued work, allows dispatched responses to finish cookie rotation, and discards cancelled results.
- Logout/expired authorization cancels and clears queries and mutations, unmounts drafts, and tells other tabs to clear their sessions. A session generation check rejects late responses.
- Mutation results containing private recovery keys, passwords, or backup files are not retained in mutation state. Browser preferences, backup folder access, and drafts remain outside the server cache.

## Reconciliation

`query-cache.ts` owns resource dependencies and invalidation. Active reads refresh; inactive reads are marked invalid. Cancellation before invalidation prevents older reads winning a race with a write.

Order events refresh orders, counts/queues, notification summaries, lineup, drops, and drop previews. Catalog and drop changes refresh their dependent lists and previews. Backup configuration events refresh backup status. The shared connection coalesces event bursts and reconciles again after both private channels subscribe. There is no polling.

`query-clock.ts` schedules the next Manila midnight or known schedule/drop boundary. The default lineup date follows Manila's current day; an explicitly selected date stays selected.

Drafts retain their original revisions. Background refresh never silently rebases a draft. Existing backend revision, price, and stock checks remain authoritative. Terminal orders scrub personal fields in every cached list/detail representation and close an open order draft.

## Rollout

1. Apply `supabase/migrations/20261113100000_admin_data_realtime.sql` before deploying the client. It adds owner-only `admin-data` broadcast hints for catalog revisions, drop revisions, and backup key configuration; existing order events remain compatible.
2. Deploy the admin client and dependency lockfiles. No business endpoint shape changes or cache backfill are required.
3. Check the shared Live indicator and test a change from a second owner session. If either channel disconnects, the UI shows Reconnecting and reconciles after recovery.

The migration was applied to the local development database during verification. Production deployment is separate.

## Checks

- `npm run test:admin-query`: deduplication, key isolation, cache expiry, retry policy, request ordering/cancellation, session retirement, invalidation races, refresh failure, redaction, and Manila boundaries.
- `npm run test:phase5`: existing order events plus two owner connections receiving catalog/drop/backup hints, non-owner exclusion, and payload privacy.
- TypeScript and focused admin lint; production build.
- Browser check: an unsaved product name survives a catalog broadcast, shows a stale-draft warning, and cannot be saved until reviewed. Test draft was discarded without changing the product.

Existing checkout limitations observed during verification: full-project lint includes generated explainer bundles and an unrelated `use-mobile.ts` effect error. The current phase4 order suite fails its public customer-pays-driver assertion (`unknown` versus `rider`); this migration does not modify the order API or that test.
