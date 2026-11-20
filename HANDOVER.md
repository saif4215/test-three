# ICSI store: handover

Everything you need to take this over. For commands and set-up details see `README.md`.

## What you have

| Item | Where |
| --- | --- |
| Source code | `icsi-store-source.tar.gz` (the corrected copy), and the branch `claude/icsi-store` on GitHub (`saif4215/test-three`) |
| Clickable preview and screenshots | `icsi-preview.html`, `icsi-showcase.html` (sample data, work offline) |
| How to run, host and test | `README.md` |
| Tests | `npm test` (107 unit tests), `npm run e2e` (104 browser tests) |

The shop contains **no real products, prices, policies, contact details or logos**. The 8 "Sample" items come from `npm run db:seed:demo` and are removed with `npm run db:unseed:demo`.

## Launch checklist (in this order)

1. **Host it.** A managed PostgreSQL database, the app (Docker or `npm run build && npm start`), and somewhere persistent for pictures (a disk or an S3-compatible bucket). Set `DATABASE_URL`, `APP_URL` (the public `https://` address) and `APP_SECRET` (32+ random characters).
2. **Create the first Owner.** `npm run admin:create -- --email … --name "…" --role owner` on the server, or set `ADMIN_SETUP_TOKEN`, open `/admin/setup` once, then remove the token.
3. **Settings → Store details.** Store name, organization name, logo (only an approved file), colours, time zone. The default colours are placeholders.
4. **Pickup & delivery.** Add only approved options and wording. Nothing is pre-filled.
5. **Homepage & content.** Add approved contact information. Edit the banner and sections, then Save & publish.
6. **Policy pages.** Paste the approved Terms, Privacy and Returns text and tick "approved". They stay hidden until you do.
7. **Add real products** (Products, or Import from a spreadsheet: imports only ever create drafts). Remove the Sample items. Add a "Uniforms" category product if you want the Uniforms section to appear.
8. **Settings → Ordering rules.** Decide on student name/class at checkout (off, optional or required), the ordering window, the terms checkbox, and who gets new-order emails.
9. **Turn on "Order requests"** in Feature switches. Place a test order yourself and walk it through the steps.
10. **Optional services**, one at a time, each tested with your own accounts first (see below).
11. **Before announcing:** check the site on a phone, check an order email arrives (if email is on), and make sure `/admin` is reachable only by the people on the Team page.

## Optional services

Each is off until its keys are set on the server **and** *Settings → Integrations → Verify* succeeds. Changing a key switches that service off until it is verified again. Full steps are in `README.md`.

- **Email (SMTP):** order confirmations, status updates, restock alerts, password resets. Failed messages are listed under *Email log* with the reason.
- **Stripe card payments:** use Stripe's test mode first. The webhook address is `APP_URL/api/webhooks/stripe`. The store only confirms an order when Stripe's signed message arrives **and** the amount matches the order total.
- **Sign in with Google:** customers (optional) and staff (only people already on the Team page).
- **AI writing assistant:** drafts only; sends just the text typed in; never customer data.

## Running it day to day

- **Orders:** *Orders* → open one → change status (Confirmed, Ready, Completed, or Cancelled), optionally with a note that is emailed to the customer. Cancelling puts stock back.
- **Packing list:** *Orders → Packing list*, grouped by the student's class, printable.
- **Stock:** *Inventory* (a number per size/colour) or the product editor. Low-stock levels show on the Dashboard.
- **Ordering window:** *Settings → Ordering rules*. Outside the window new orders are refused on the server, and the shop says so.
- **Announcements, homepage, policies:** *Homepage & content*. Homepage edits stay a draft until published.
- **Team:** *Team*. Roles: **Owner** (everything), **Admin** (shop, content, reports; no settings or team), **Staff** (orders and stock; no exports or content). Revoking someone ends their sessions at once.
- **Forgotten password:** `npm run admin:create -- --email … --reset` on the server, or "Forgot your password?" if email is on.
- **Activity log:** *Activity log* shows who changed what.

## Backups and secrets

- **Back up the database** (your host's managed backups) **and the pictures folder or bucket.** The code can be rebuilt from the tarball or GitHub; the data cannot.
- **Keep `APP_SECRET` safe and stable.** It signs order tracking links and sign-in state. Changing it breaks existing tracking links.
- Keys live only in the server's environment. They are never in the database, the admin screens or the browser. Rotate a key by changing it on the server and pressing Verify again.
- Migrations are additive and the seed scripts never change or delete existing data.

## What was and wasn't verified

- **Verified by automated tests:** ordering and pricing, stock locking, the ordering window, tracking, the whole admin, roles, security headers, secrets never reaching the browser, upload checks, accessibility (axe, WCAG 2.2 A/AA), layouts from 360px to 1440px, and a crawl of every page.
- **Verified only against local stand-ins, not the real services:** Google, Stripe, the mail server and the Anthropic API. The stand-ins use the same protocols, but test each real service with your own accounts.
- **Never run:** the `Dockerfile` and `render.yaml` (review them before using), and a production deployment.

## Known limits

- US dollars only. No tax calculation. Delivery is up to four fixed-fee options you define; there are no carrier rates.
- **Refunds are done in Stripe.** The store flags a payment that arrives after an order was cancelled so you can refund it.
- Customer accounts are Google sign-in only (no customer passwords). Guest checkout always works.
- Unpaid card orders release their stock when Stripe reports the payment page expired, and also after 2 hours whenever someone opens the Dashboard or Orders page. There is no background scheduler. If you want one, call that clean-up from a cron job.
- The small rate-limit table is never trimmed automatically (it grows slowly). `pruneRateLimits()` in `src/lib/rate-limit.ts` is ready to call from a scheduled job.
- Favourites live in each visitor's browser, not on the server.

## Open decisions

1. **GitHub:** the repo was empty, so `claude/icsi-store` became its default branch and there is no `main`. Either create `main` (an empty first commit) and open a pull request, or simply rename the branch to `main`.
2. **Real merchandise and uniforms:** the old ICSI sites could not be read from the build environment, so no real items were copied. They need to be entered or imported.
3. **Logo and colours:** only an approved logo and official colours should go in.
