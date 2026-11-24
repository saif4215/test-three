# ICSI store

A merchandise store with an administration area, built with Next.js (App Router), TypeScript, Tailwind CSS and PostgreSQL.

The look is a bold, photo-first retail style (big type, full-width banners, rows of products you scroll sideways, a size grid, a bag that slides in from the side). It does not use anyone else's name, logo, wording or pictures.

> **Nothing in the shop is invented.** There are no real products, prices, policies, events, contact details or logos in this code. Everything in `npm run db:seed:demo` is labelled "Sample" and can be removed with `npm run db:unseed:demo`. Policy pages (Terms, Privacy, Returns) stay hidden until someone pastes in approved wording and ticks "approved".

## What it does

**For shoppers:** browse and search, filter and sort, products with colours and sizes, favourites (kept in the browser), a bag, checkout as a guest (or with Google if switched on), a private link to follow an order, optional back-in-stock emails, an optional "Uniforms" section.

**For the team** (`/admin`): products with photos by colour, stock, low-stock levels, spreadsheet import (always creates drafts), categories, limited-edition collections, discount codes, orders and a status flow with customer emails, a packing list grouped by the student's class, an ordering window (open and close dates), announcements, a homepage editor with draft and publish, policy pages, analytics and CSV downloads, an activity log, a team page with roles (Owner, Admin, Staff), and a settings page with feature switches.

**Optional outside services**, each OFF until its keys are set on the server **and** a real test call succeeds under *Admin → Settings → Integrations*: email (SMTP), card payments (Stripe Checkout), Sign in with Google, and an AI writing assistant (Anthropic). Changing a key switches that service off again until it is verified again.

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
cp .env.example .env            # then edit APP_SECRET (see below)
npm run db:dev                  # starts a throw-away local PostgreSQL (leave it running)
npm run db:migrate              # creates the tables
npm run db:seed                 # categories + empty policy pages (never adds products; safe to repeat)
npm run db:seed:demo            # OPTIONAL: 8 clearly labelled "Sample" products
npm run admin:create -- --email you@your-domain.org --name "Your Name" --role owner
npm run dev                     # http://localhost:3000   (admin: http://localhost:3000/admin)
```

`admin:create` asks for a password (12+ characters) without showing it. It is never a command-line argument.

A new store is **browse-only**: open *Admin → Settings → Feature switches* and switch on "Order requests" (customers send a request you accept) and/or "Online card payments" (needs Stripe, below).

## Put it on the internet

**On Render (the short way):** use the **Blueprint** link for this repository (see `render.yaml`). It asks you nothing: the database is created and connected, `APP_SECRET` and the one-time `ADMIN_SETUP_TOKEN` are generated, and the site's address is taken from Render automatically. When it is live, open `your-site/admin/setup`; the page tells you where to find the setup code (Render → the service → Environment → the eye next to `ADMIN_SETUP_TOKEN`). Then sign in, press **Add sample products** on the Dashboard if you want to look around, and follow the checklist there. Optional services (email, card payments, Google, the writing assistant) are added later under Environment and switched on in Admin → Settings.

**Anywhere else:**

1. Use a managed PostgreSQL database and set `DATABASE_URL`.
2. Set `APP_URL` to the public address (with `https://`; on Render it is filled in for you), and `APP_SECRET` to 32+ random characters (`openssl rand -base64 48`). Changing `APP_SECRET` invalidates tracking links.
3. Pictures: a persistent disk (`UPLOAD_DIR`) or any S3-compatible bucket (`STORAGE_DRIVER=s3`, see `.env.example`).
4. Build and start: `npm run build && npm run db:migrate && npm run db:seed && npm start`, or use the included `Dockerfile` / `render.yaml` (these two have **not** been run in this build environment: review them first).
5. Create the first Owner: either run `npm run admin:create` on the server, or set `ADMIN_SETUP_TOKEN` and open `/admin/setup` once (the page closes itself as soon as any administrator exists, so the token can stay).

Rate limits use the visitor's address. Run the app behind your host's proxy (which appends it to `X-Forwarded-For`); `TRUSTED_PROXY_HOPS` (default 1) says how many proxies to trust, and `0` ignores the header when the app is reached directly. The address a visitor forges at the start of that header is never used.

Point your host's health check at `/api/health`: it also runs the small housekeeping job (cancels abandoned card orders, clears expired sessions and old counters) at most once every five minutes.

## Turning on the outside services

| Service | Set on the server | Then |
| --- | --- | --- |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | Settings → Integrations → Verify, then switch on "Email notifications". Use "Send me a test email". |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | In Stripe add a webhook to `APP_URL/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.expired` and `checkout.session.async_payment_failed`. Verify, then switch on "Online card payments". Use Stripe's test mode first. |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Create a "Web application" OAuth client; authorised redirect URI `APP_URL/api/auth/google/callback`. Verify, then switch on customer and/or staff sign-in. Staff can only sign in if their email is already on the Team page (nobody can register through Google). Optionally lock staff sign-in to your Workspace domain in Settings → Staff sign-in. |
| AI assistant | `ANTHROPIC_API_KEY` (optionally `ANTHROPIC_MODEL`) | Verify, then switch on. Only text typed into the assistant is sent: never customer or order data. It drafts; a person publishes. |

Keys are read from the server's environment only. They are never stored in the database, never shown in the admin and never sent to the browser.

## Security notes

- Everything is checked on the server: roles, prices (the browser sends option ids and quantities only), stock (rows are locked while an order is placed), the ordering window, and every download. Hiding a button is never the check.
- A strict per-request Content-Security-Policy (nonce-based), clickjacking and sniffing protection, HSTS, no caching of private pages.
- Staff sign-in: scrypt-hashed passwords, hashed session tokens, lock-out and rate limits, forced password change for temporary passwords, sessions end the moment access is revoked. No public registration; the first Owner is created from the server.
- Customer data in CSV downloads is protected against spreadsheet formula injection. Uploaded pictures are re-encoded; non-pictures and SVG are refused.
- Row-level security is enabled on every table with no public policies, so the database's own public API (if you ever expose one) sees nothing. The app connects with a server-side connection string that never reaches the browser.
- Migrations are additive and the seed scripts never change or delete existing data.

## Tests

```bash
npm run typecheck && npm run lint
npm test                         # unit and integration tests against a real PostgreSQL (started for you)
npm run e2e                      # builds the store and runs the browser tests (below)
```

`npm run e2e` starts a throw-away database, **local stand-ins** for Google, Stripe, an SMTP server and the Anthropic API (so those code paths run for real without accounts or money), a production build of the store, and then drives it with Chromium: first-run set-up and gating, the storefront, card payment and webhooks, order handling and emails, Google sign-in (customer and staff), the admin tools, security checks (headers, CSP, secrets in JavaScript bundles, roles, rate limits, hostile input), accessibility (axe, WCAG 2.2 A/AA), layouts at phone to desktop widths, and a crawl of every page.
Set `E2E_CHROMIUM=/path/to/chromium` to use an already-installed browser, otherwise run `npx playwright install chromium` once. `npm run e2e -- --serve` leaves everything running so you can run single specs.

**What this does *not* prove:** the stand-ins speak the same protocols as the real services, but the real Google, Stripe, mail provider and Anthropic have not been contacted. Verify each one with your own test accounts before going live. The Docker and Render files have not been run either.

## Where things are

```
src/app/(store)/      the shop           src/app/admin/       the admin area
src/lib/              server logic       db/migrations/       SQL (applied in order, once)
scripts/              seed, admin, e2e   tests/  e2e/          unit and browser tests
```
