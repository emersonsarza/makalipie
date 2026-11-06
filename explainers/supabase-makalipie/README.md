# Supabase through Makalipie

A five-minute, silent, captioned Remotion lesson (1920×1080, 30 fps). Open **Makalipie-Supabase** for the whole lesson or **Chapters** for individual topics. Press Play; pause or scrub whenever you need more reading time.

## Run locally

From this directory, run `npm install` once, then `npm run dev -- --no-open --port 3100`.
Open http://localhost:3100/Makalipie-Supabase. No Supabase account or credentials are needed. No site or database migration is performed.

## Chapters

| Start | Topic |
| --- | --- |
| 0:00 | Where data lives |
| 0:40 | Free allowances |
| 1:40 | A guest Buko order |
| 2:30 | Caching and transfer |
| 3:00 | Optimization |
| 3:40 | Traffic scenarios |
| 4:25 | Decision and monitoring |

## Sources — checked 28 October 2026

| Allowance / behavior | Official source |
| --- | --- |
| Unlimited API requests; 500 MB database per project; 1 GB file storage; separate 5 GB outgoing and 5 GB cached egress; 50,000 Auth MAU; shared CPU and 500 MB RAM; pause after one inactive week; two active Free projects; no automatic backups | [Pricing](https://supabase.com/pricing) |
| Transfer from database, Auth, Storage, functions and Realtime, including delivery to your server | [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) |
| Cached and uncached file delivery are separate quotas | [Storage bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth) |
| Database size includes data and indexes; deleted rows may not immediately shrink usage | [Database size](https://supabase.com/docs/guides/platform/database-size) |
| Distinct sign-ins/token refreshes counted per cycle | [Auth MAU](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users) |
| 500,000 function invocations per cycle; failed invocations count; OPTIONS excluded | [Edge Functions](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations) |
| 2 million messages per cycle; database changes count per subscriber; Broadcast counts sent plus received | [Realtime messages](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages) |
| 200 concurrent Realtime connections, also per-second service limits | [Realtime limits](https://supabase.com/docs/guides/realtime/limits) |
| Excess usage may trigger restrictions; not automatic paid overages on Free | [Fair use](https://supabase.com/docs/guides/platform/billing-on-supabase#fair-use-policy) |

Database/file sizes and peak connections are not monthly-reset counters. Egress, MAU, messages and invocations are measured per billing cycle. Usage allowances may aggregate across projects at the organization level; database size is per project. Check the organization usage dashboard and current billing documentation before planning multiple projects. This lesson models one project and does not multiply shared quotas.

## Repository grounding

The existing site uses Firestore through server-side stores. `src/lib/catalog/store.ts` reads products, variants, add-ons and settings. Branches, schedules, allocations, orders, payments and events are represented in the corresponding stores. The illustrated SQL relationships are a proposed mapping, not an existing migrated schema.

`src/lib/public-cache.ts` remembers production values per process without a timer; writes invalidate local keys. Development bypasses that cache. Multiple processes, deployments, restarts and invalidations cause more reads, and other processes need coordinated invalidation/expiry for freshness. `src/lib/products/public.ts` uses this cache for the menu. The 15-second timer in `src/hooks/use-order-schedule.ts` advances browser time only; an explicit refresh fetches availability.

The Buko image and Garet fonts are copied from public website assets. Maya is fictional. No environment files, credentials, production database records or customer details are read or included.

## Model assumptions

Edit `src/scenario.ts` to change inputs. Decimal units: 1 KB = 1,000 bytes; 1 MB = 1,000 KB; 1 GB = 1,000 MB. Dashboard accounting, protocol overhead and compression can differ; verify against actual usage.

- Menu: 20 KB per fetch, 30 days. At 100 / 1,000 / 10,000 visits daily: **0.06 / 0.6 / 6 GB** outgoing menu data.
- Always-running, scheduled, single cache refreshed every five minutes: 8,640 fetches × 20 KB = **0.1728 GB**. This is an alternative design, not the existing cache. A cold initial fetch can add one response; extra processes multiply usage. Low traffic or request-driven refresh can use less. Scheduled refresh may use more than uncached low traffic.
- Order retention: 10 KB per order including related rows and indexes is an assumed effective footprint. At 10 / 50 / 200 orders daily, add **3 / 15 / 60 MB per 30 days**. This excludes the initial database, system objects and unexpected growth. SQL row JSON size does not equal physical table/index size.
- Photos: 1 MB downloaded per visit × 1,000 visits/day × 30 = **30 GB** transfer; caching may reduce network requests, but Supabase CDN hits still spend cached egress.
- One database-change event delivered to five subscribers = **five Realtime messages**. Broadcast has different rules.
- Guest customers in this example have no Supabase Auth session. Using anonymous Auth would count toward MAU. A staff login consumes Auth MAU only if staff authentication is actually moved to Supabase Auth.
- Incoming uploads are not outgoing transfer, but stored data and response bytes count. A browser/server cache hit with no Supabase call causes no Supabase transfer. Website photo delivery uses the website host, which has its own limits.
- Normal Next.js server routes do not count as Supabase Edge invocations. Responses and database work still use their respective resources. Separate hosting compute is not estimated.

Menu figures are not a full-site forecast: availability requests, repeat status checks, writes, admin screens, Auth and optional services add usage. Request counts alone do not guarantee performance on shared compute. Keep private data authorized; use an atomic server-side transaction for price checks, stock reservation and order creation. Never use a public cache for customer data.

No automatic retention deletions are proposed. Agree retention and recovery requirements before archiving. The 70% review trigger is a suggested planning buffer, not a Supabase-enforced threshold.

## Verification

`npm run check` checks TypeScript and the scenario arithmetic/action accounting. `npm run build` bundles the preview. Visual QA covers all chapter states; no MP4 is generated.
