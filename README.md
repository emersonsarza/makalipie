# Makalipie

Marketing site for [Makalipie](https://www.instagram.com/makalipie/) — proudly Cebuana-made tarts and pies in Banilad, Cebu.

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
# optional: echo 'NEXT_PUBLIC_SITE_URL=https://your-domain' > .env
docker compose up -d --build
```

App listens on host port **3006** (`3006:3000`). Point your reverse proxy at it.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for SEO / OG / sitemap (defaults to `https://makalipie.by1002.com`) |

## What’s on the site

- Home: hero, menu teaser, story, reviews, visit, how to order
- `/menu` full catalog with prices
- `/order` form → copy summary → Instagram DM
- Kiosk: 2nd Floor, Streetscape, Banilad — daily 10AM–8PM
- Buko pie bestseller: Fri–Sun via Instagram DM
- Sunday Market: Butter Chicken Curry pie ~7AM–3PM
