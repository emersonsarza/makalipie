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
cp .env.example .env   # first time only; then edit with production values
docker compose up -d --build
```

App listens on host port **3006** (`3006:3000`). Point your reverse proxy at it.

Production `.env` on the server (same names as `.env.example`):

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL (e.g. `https://makalipie.by1002.com`) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web app config (embedded at **build** time) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account (runtime only; not baked into the image) |
| `ADMIN_APP_ORIGIN` | Exact admin URL origin, e.g. `https://makalipie.by1002.com` (no path) |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | Must stay `false` in production |
| `ORDER_INTAKE_ENABLED` | Set to `true` only when public ordering should be open |

After any `.env` change on the VPS:

```bash
cd /srv/apps/makalipie
docker compose up -d --build
```

Changing `NEXT_PUBLIC_*` requires a rebuild. Server-only vars (`FIREBASE_*`, `ADMIN_APP_ORIGIN`) still need a container recreate; `docker compose up -d --build` covers both.

## What’s on the site

- Home: hero, menu teaser, story, reviews, visit, how to order
- `/menu` full catalog with prices
- `/order` form → copy summary → Instagram DM
- Kiosk: 2nd Floor, Streetscape, Banilad — daily 10AM–8PM
- Buko pie bestseller: Fri–Sun via Instagram DM
- Sunday Market: Butter Chicken Curry pie ~7AM–3PM

## Admin — owner access and products

The owner workspace is at `/admin`; sign-in is at `/admin/login`. It uses the existing shadcn/ui components with scoped Makalipie styling. Products and Catalog (variants/pricing, add-ons, and product availability) are functional. Order intake, kitchen tools, and bakery settings are subsequent parts. The existing public website and copy-to-chat form continue to work.

### Connect your existing Firebase development project

1. Fill in `.env.local` (already ignored by Git). `.env.example` contains the same variable names and instructions. Preserve your existing `NEXT_PUBLIC_SITE_URL`.
2. In Firebase Console → Project settings → General → Your apps, register/select a **Web app**. Copy its `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` into the corresponding `NEXT_PUBLIC_FIREBASE_*` fields.
3. Under Project settings → Service accounts, generate a private key. Copy `project_id`, `client_email`, and `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Wrap the private key in double quotes and retain the literal `\n` sequences. Do not place the downloaded key in the repository or paste it into chat. Server and browser project IDs must match.
4. Enable Authentication → Email/Password and create your owner account under Authentication → Users, if it does not already exist. Create the default Firestore database. Add `localhost` to Auth authorized domains if required by your project configuration.
5. Keep `ADMIN_APP_ORIGIN=http://localhost:3000` and `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`. Open admin using that exact origin. If you change the port/hostname, update the origin and restart the development server.
6. Grant your existing Auth account owner access once:

   ```bash
   npm run admin:bootstrap -- --email your-owner-email@example.com
   ```

   This trusted local command creates `admins/{uid}` and a bootstrap marker. It refuses to overwrite an existing profile or run after an owner already exists. There is no public signup or role-assignment endpoint. Your password stays in Firebase Authentication, not in `.env.local` or Firestore.

7. Install the deny-by-default rules into the **development** project. Check the project ID before running; these rules replace that project's existing rules. They intentionally deny all browser Firestore/Storage access in Part 1, while the authenticated server uses the Admin SDK.

   ```bash
   npx firebase login
   npx firebase deploy --only firestore:rules --project YOUR_DEV_PROJECT_ID
   # Only if Firebase Storage is already enabled:
   npx firebase deploy --only storage --project YOUR_DEV_PROJECT_ID
   ```

8. Restart `npm run dev` and open `http://localhost:3000/admin`.

Use a supported current Node 22 LTS release (22.13 or newer) or Node 24 for the Firebase tooling. The included `.nvmrc` selects Node 24 (`nvm install` then `nvm use`, if you use nvm). Firebase Storage is required for product photo uploads, but not for sign-in or editing text. Enable Storage in your development project and use its exact bucket name in `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. The service account needs access to that bucket.

### Access and session behavior

- Firebase verifies the email/password in the browser, then exchanges a recent ID token for a 12-hour HttpOnly, SameSite=Strict session cookie. Client Auth persistence is memory-only and cleared after exchange. Cookies are Secure in production; production admin requires HTTPS.
- Every protected page and API checks session validity/revocation and the current `admins/{uid}` profile. Only `active: true` and `role: owner` are allowed in Part 1. Never rely on the layout as the only authorization check; future reads/mutations must call the shared guard too.
- Session creation/sign-out require an exact configured Origin. The sign-in endpoint also requires JSON, limits body size, and rejects extra fields. Firebase Auth handles password sign-in throttling; use hosting-level request limits before a public launch.
- The visible workspace rechecks access on focus and every minute. Invalid sessions return to sign-in. Temporary service failures show a retry state rather than granting access.
- Sign-out removes this browser's cookie. For suspected compromise, revoke refresh tokens through a trusted Admin SDK operation and disable the account or set `admins/{uid}.active` to false. Do not leave the client without an active owner.
- For owner recovery, use Firebase Console password reset/account management. If membership was accidentally disabled, an authorized project administrator can repair that specific record in the console. The bootstrap command intentionally is not an ongoing role editor.
- No secrets or raw authentication tokens are returned in errors. Existing account login failures use generic wording. The admin pages are marked noindex.

### Local emulators (optional; no cloud credentials)

The emulator setup uses only the isolated `demo-makalipie` project. A current Java runtime (Java 21+) is required for Firestore. It does not change `.env.local` or contact the real project.

```bash
# Terminal 1
npm run emulators

# Terminal 2, after the emulators are ready
npm run emulators:seed
npm run dev:emulators
```

Open `http://localhost:3001/admin` and sign in with the **emulator-only** account `owner@example.test` / `Makalipie-demo-only!`. The emulator UI is at `http://127.0.0.1:4000`. Fake emulator data is ephemeral and can be reseeded. Do not run emulator mode in production.

### Verification

```bash
npm run test:admin   # Authorization, Origin/CSRF, recent sign-in, schema boundaries
npm run test:rules   # Starts Firestore emulator and checks browser access denial
npm run lint
npm run build
```

With the emulators and `npm run dev:emulators` running on port 3001, `npm run test:session` checks the real session endpoints, protected page, membership changes, disabled accounts, sign-out, and malformed/cross-origin requests using disposable emulator accounts. Stop running emulators before `npm run test:rules`, since that command starts its own emulator.

Before connecting real staff, verify owner login/logout, nonmember/staff/inactive denial, revocation, and expired sessions against your dev project or emulators. Part 1 does not enable order intake.

### Hosting the admin later

The existing VPS deployment instructions above remain unchanged. Vercel is the planned host for the expanded app. Set the same environment variables there (browser values are embedded at build time), use HTTPS, and set `ADMIN_APP_ORIGIN` to the exact admin origin. Begin with `/admin`; custom admin-host routing is not implemented in Part 1. If moving to Vercel, start with Cloudflare DNS-only records and Vercel-managed TLS.

The current Docker setup still builds the public site only: to enable admin there later, explicitly supply Firebase public values as build arguments and server credentials as runtime secrets. `.dockerignore` excludes local environment files and credentials; do not copy them into an image.

Authentication follows [Firebase's session cookie flow](https://firebase.google.com/docs/auth/admin/manage-cookies). Permission checks remain mandatory in server code because Firebase Admin SDK operations bypass Firestore rules.

### Products — first catalog slice

Open `/admin/products`, then **Import existing menu** once. This copies the seven current products with their descriptions, photos, and existing prices into Firestore. Previewing the page does not write data, and repeated imports never overwrite edits.

- Search and filter products; create and edit names, descriptions, category, photo/alt text, allergens, customer notes, display order, and visibility.
- New products start hidden. Save as visible to include them on the home page, menu (including structured data), and order form. The home selection shows the first four visible products in display order.
- Existing prices are retained and cannot be changed by this editor. New products show **DM for price**. Use Catalog for sizes/variants and price editing.
- Upload still JPG/PNG/WebP files up to 3 MB and 25 megapixels. The server validates, rotates, and resizes them to WebP (maximum 1600 px). Product photos have public token links; all direct client database/storage writes remain denied. Replaced or abandoned uploads are retained; automatic media cleanup is not yet implemented.
- Save conflicts from two editors are rejected instead of overwriting newer changes. A reload option lets the owner discard stale edits. Unsaved edits prompt before leaving.
- Before import, the current coded menu remains the source. After import, hidden or empty catalogs never fall back to old products. Database failures show an unavailable state. A deployment without Firebase configured uses the original static menu, so configure Firebase on the public deployment before publishing admin changes there.

With the local emulators and preview running, `npm run test:products` checks the full lifecycle, preserved prices, concurrent edits, storefront output, photo upload/download, validation, and denied requests. It resets only the isolated demo product collection. The preview uses port 3001 and `.next-emulator` so it can run beside the real development app on port 3000. Emulator sessions use a separate cookie name from real owner sessions.

### Catalog — sizes, add-ons, and product availability

After importing Products, open `/admin/catalog` and choose **Set up catalog options** once. This preserves existing product edits and prices, creates a Standard variant for every product, brings across both existing extras, and preserves Buko’s Friday–Sunday schedule. Repeating setup is safe and does not overwrite later edits.

The Catalog screen manages:

- Sizes/variants: separate fixed prices (integer centavos) or quote-required pricing, preparation days, display order, and active/inactive state. Existing variants are deactivated rather than deleted. Products with no active sizes remain visible in the menu as unavailable and are omitted from ordering.
- Product availability: allowed weekdays, blocked dates, and compatible add-ons. No selected weekdays means daily availability; no compatible add-ons means none. Dates and preparation days use Manila calendar dates, not rolling 24-hour periods.
- Add-ons: names, images, allergens, prices, preparation days, per-pie or per-order charges, active state, sorting, and optional/required messages with length limits. Choose compatible products from each product’s catalog options. Per-pie extras multiply by line quantity; their message applies to each pie in that line. Per-order extras require at least one compatible selected product.

The storefront reads current active variants and add-ons. Existing product-level prices remain only as migration data; after setup, variants are the price source. The order form shows each available size, checks the chosen date, calculates known subtotals, and checks a fresh server catalog before producing the copy-to-chat summary. Quoted items remain unpriced, never presented as free. The preview endpoint does not create orders, reserve capacity, charge payment, or send messages. Branch schedules, closures, and same-day cutoff are now managed in Bakery schedule. Capacity and durable order intake arrive in Phase 3.

Run `npm run test:catalog` for deterministic validation, money, Manila date/weekday/lead-time, compatibility, and customization tests. With emulators and `npm run dev:emulators` running, run `npm run test:catalog:integration` for migration, editing/conflicts, permissions, storefront output, and authoritative preview tests. Integration tests use only the `demo-makalipie` emulator project and reset its catalog fixtures. Run integration suites sequentially, because they share those fixtures.

### Unified catalog workspace

`/admin/catalog` combines the product finder and editor. Search/filter products on the left; use Selling options or Product details on the right, with separate saves. Shared extras live under Manage add-ons. Product, tab, and add-on selections are shareable query parameters; the old product URLs redirect to this workspace. On phones, Back to products restores the finder and its search. Unsaved edits require a discard decision before switching sections, and saves/uploads disable switching. Blocked dates use the shared Day.js helper and remain calendar-date strings in storage.

## Branch-aware ordering (Phase 1)

Owner settings are at `/admin/branches`. Regular customer ordering uses the selected main branch at `/order?branch=cebu` or `/order?branch=manila`; missing or invalid branch parameters use the saved default. Product-size assignments and Regular/Pre-order classification are managed on the Branches page. Existing variants initially default to Cebu only.

See `MAKALIPIE_ORDERING_FOUNDATIONS.md` for ordering decisions and `MAKALIPIE_ORDERING_PHASE_PROGRESS.md` for the verification record. Scheduling is implemented in Phase 2; durable order submission follows in Phase 3.

Run `npm run test:branches` for pure branch rules. With the local demo Auth/Firestore emulators and initialized demo catalog running, `npm run test:branches:integration` targets `http://localhost:3002` by default; override `BRANCH_TEST_ORIGIN` for another local preview port. The preview's `ADMIN_APP_ORIGIN` must match. This integration test temporarily changes demo branch settings, restores its own changes, and preserves existing catalog data. Use a Node version satisfying `package.json` (verified here with Node 24).

## Cart and scheduling (Phase 2)

Open `/admin/schedule` to enable dates for each branch, set start/cutoff times, open weekdays, closed dates, and the shared booking horizon (initially 30 days). Missing schedules stay closed until saved and enabled. Times use Asia/Manila; only complete one-hour slots are offered, and cutoff stops same-day requests only.

The customer form picks the earliest valid date until the customer selects a date or slot. Later schedule changes preserve that selection and cart, explain invalid dates/slots, and block continuing until corrected. Dates refresh every minute, on focus, or using Refresh available dates. The server rechecks schedule and catalog before returning a chat summary. No allocation or durable order is created yet.

Run `npm run test:scheduling` for date/slot rules. Run `npm run test:scheduling:integration` with the local demo emulators and initialized catalog; it defaults to port 3002 (override `SCHEDULE_TEST_ORIGIN`). Run it sequentially with branch integration tests because they temporarily modify and restore the same settings. The older catalog integration suite resets demo catalog data; use it only in a disposable fixture environment.
