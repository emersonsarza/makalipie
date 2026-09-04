# Makalipie

Marketing site for [Makalipie](https://www.instagram.com/makalipie/) — proudly Cebuana-made tarts and pies in Banilad, Cebu.

This is a display-only MVP. There is no cart, checkout, or pre-order form. Order CTAs go to Instagram DMs and GrabFood so online pre-order can land later.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- shadcn/ui

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint
```

## Deploy on Vercel

This repo is Vercel-ready (Next.js defaults). Optional environment variable:

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO, Open Graph, sitemap, and robots (defaults to `https://makalipie.vercel.app`) |

## What’s on the site

- Home hero, menu (sweet + Butter Chicken Curry pie), story, visit/location, how to order, footer
- Kiosk: 2nd Floor, Streetscape, Banilad — daily 10AM–8PM
- Buko pie bestseller: Fri–Sun via Instagram DM
- Sunday Market: Butter Chicken Curry pie ~7AM–3PM
- Soft “pre-order coming soon” note in the footer
