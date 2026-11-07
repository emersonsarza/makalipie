# Makalipie

Marketing site for [Makalipie](https://www.instagram.com/makalipie/) — proudly Cebuana-made tarts and pies in Banilad, Cebu.

The storefront is static. Catalog, hours, branches, and links live in `src/lib/catalog/seed-data.ts`. Customers copy an order message and open Instagram; the site does not save orders.

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

## Deploy (VPS)

Push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which SSHs into the VPS and runs `/srv/apps/makalipie/deploy.sh` (git pull + `docker compose up -d --build`).

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
- `/order` form → copy summary → Instagram DM
- Kiosk: 2nd Floor, Streetscape, Banilad — daily 10AM–8PM
- Buko pie bestseller: Fri–Sun via Instagram DM
- Sunday Market: Butter Chicken Curry pie ~7AM–3PM
