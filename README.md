# Makalipie

Marketing site for [Makalipie](https://www.instagram.com/makalipie/) — proudly Cebuana-made tarts and pies in Banilad, Cebu.

The storefront uses the published Supabase catalog, branch hours, links, and drop lineup. Customers submit through `/order` and receive an order number to share with Makalipie in chat.

The server contracts for the later frontend are in [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md). Local Supabase already serves catalog, drops, orders, owner events, and encrypted export. The public pages do not read that database yet.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- shadcn/ui
- Docker on VPS (same pattern as TBott)

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint
```

## Environments

| Place | Application | Database |
| --- | --- | --- |
| This computer | `npm run dev` | Local Supabase |
| Sandbox | VPS, port 3006 | Hosted Supabase project in Singapore |
| Production | Vercel | A separate hosted Supabase project, not created in phase 1 |

The VPS is the sandbox app. Vercel is production. `sandbox` and `main` both deploy into the same folder on the VPS, `/srv/apps/makalipie`, so a push of either branch replaces whatever is running there. Phase 1 does not push and does not change that deploy.

Server environment variables live in `.env.local`, which is gitignored:

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Local or hosted Supabase URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key. It cannot read application tables |
| `SUPABASE_SECRET_KEY` | Server-only key. It bypasses row security |

Do not commit the secret key, put it in `NEXT_PUBLIC_*`, or pass it as a Docker build argument.

### Local database

Docker has to be running.

```bash
npm run supabase:start
npm run supabase:env
npm run test:handoff
```

`npm run test:handoff` runs the phase 1 through phase 6 checks. The route list is in [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md).

`npm run supabase:env` writes `.env.local` from the local Supabase keys. Create `nika@makalipie.com` in local Studio under Authentication, then allowlist that user:

```bash
npm run allowlist-owner
```

For a local database only, `OWNER_PASSWORD` in `.env.local` lets that command create the user. The password stays in Supabase. A forgotten password is reset in the Supabase dashboard by a developer. There is no reset email. If the user is deleted and created again, run `npm run allowlist-owner` so the new id is allowlisted.

There is no login page in this phase. The frontend will later call:

- `POST /api/admin/session`
- `GET /api/admin/session`
- `POST /api/admin/session/refresh`
- `POST /api/admin/session/logout`
- `POST /api/admin/session/password`

The refresh token is only in an httpOnly cookie. The response carries a short-lived access token for the browser to hold in memory.

### Hosted sandbox

Create one Supabase project and choose the Singapore region. Do not create the production project in this phase, and do not put real customer data in the sandbox.

1. Put that project's URL and keys in `.env.sandbox`, using the same three names. That file is gitignored.
2. Link this repo and apply the migration and seed:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase db query --remote --file supabase/seed.sql --yes
```

3. Create `nika@makalipie.com` in that project's Authentication dashboard.
4. Allowlist the user. This phase did not create the project and did not run the checks. When the sandbox exists, run all six phase scripts against it, using `--env-file=.env.sandbox` in place of `.env.local`:

```bash
node --env-file=.env.sandbox --import tsx scripts/allowlist-owner.ts
node --env-file=.env.sandbox --import tsx --test tests/phase1-database.test.ts tests/phase1-auth.test.ts
node --env-file=.env.sandbox --import tsx --test --test-concurrency=1 tests/phase2-eligibility.test.ts tests/phase2-catalog.test.ts
node --env-file=.env.sandbox --import tsx --test --test-concurrency=1 tests/phase3-drops.test.ts
node --env-file=.env.sandbox --import tsx --test --test-concurrency=1 tests/phase4-orders.test.ts
node --env-file=.env.sandbox --import tsx --test --test-concurrency=1 tests/phase5-realtime.test.ts
node --env-file=.env.sandbox --import tsx --test --test-concurrency=1 tests/phase6-backups.test.ts
```

## Deploy (VPS)

A push to `main` or `sandbox` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which SSHs into the VPS and runs `/srv/apps/makalipie/deploy.sh` (git pull + `docker compose up -d --build`). Both branches deploy into that same folder.

Uses the same secrets as TBott:

| Secret | Purpose |
| --- | --- |
| `VPS_HOST` | Server hostname / IP |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Private key for that user |

### One-time server setup

```bash
sudo mkdir -p /srv/apps
sudo git clone git@github.com:emersonsarza/makalipie.git /srv/apps/makalipie
cd /srv/apps/makalipie
cp .env.example .env   # first time only; then edit with production values
docker compose up -d --build
```

App listens on host port **3006** (`3006:3000`). Point your reverse proxy at it.

Production `.env` on the server (same names as `.env.example`):

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL (e.g. `https://makalipie.com`) |
| `NEXT_PUBLIC_GRABFOOD_URL` | Optional Grab store link override |
| `GOOGLE_SITE_VERIFICATION` | Optional Search Console HTML token |

After any `.env` change on the server:

```bash
cd /srv/apps/makalipie
docker compose up -d --build
```

Changing `NEXT_PUBLIC_*` requires a rebuild. `docker compose up -d --build` covers that.

## What’s on the site

- Home: hero, menu teaser, story, visit, how to order
- `/menu` full catalog with prices
- `/order` for Cebu, visible branches, and event-specific drop checkout
- `/order/status` for the latest confirmation on this browser
- Kiosk: address and hours from the Cebu branch settings
- Buko pie bestseller: Fri–Sun via Instagram DM
- Sunday Market: Butter Chicken Curry pie ~7AM–3PM
