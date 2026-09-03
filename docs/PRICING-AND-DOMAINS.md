# The marketing site, the app, and getting paid

Three things ship together here: the public site at `readysetamen.com`, the
application at `app.readysetamen.com`, and the free-to-paid purchase flow that
connects them. They are one Next.js build in one repository on one Railway
service.

---

## Why one service, not two

The spec asked which is cleaner: one Railway service routing by hostname, or two
services from the same repo. **One service.**

The marketing site is a single landing page that shares this app's brand tokens,
fonts, and components. Two services would mean two builds of the same code, two
sets of environment variables, and two chances for the brand to drift — and a
second service costs money every month for a product whose economics depend on
near-zero variable cost.

So both hostnames reach the same deployment, and `src/middleware.ts` decides
which host owns which path:

| Request | Result |
| --- | --- |
| `readysetamen.com/` | The marketing page |
| `www.readysetamen.com/*` | 308 to `readysetamen.com/*` (only if www reaches the app; normally your DNS provider redirects it) |
| `readysetamen.com/orgs/…` | 307 to `app.readysetamen.com/orgs/…` |
| `app.readysetamen.com/` | 307 to `/orgs` — someone signed in wants their trips |
| `/api/*`, `/legal/*`, `/_next/*` | Served from whichever host asked |

**With either `MARKETING_HOST` or `APP_HOST` unset, nothing is redirected** and
one host serves everything. That is how local development, the test suites, and
a bare `*.up.railway.app` domain all work — the split only switches on once you
have both domains.

### DNS

Only two hostnames need to reach the application:

| Record | Name | Value |
| --- | --- | --- |
| ALIAS / ANAME / CNAME | `@` | your Railway domain |
| CNAME | `app` | your Railway domain |

Add both as custom domains on the same Railway service.

**`www` is handled outside the app.** Railway plans cap the number of custom
domains, and `www` does not need one: it is a redirect, not a site. Point it at
`readysetamen.com` with a redirect rule at your DNS provider — Cloudflare's
Redirect Rules, Netlify DNS, or your registrar's URL forwarding.

Check that the redirect works over **https**, not just http. Plain registrar URL
forwarding often has no certificate for `www`, so visitors get a browser
security warning before the redirect ever happens. Cloudflare (free, proxied)
issues a certificate covering `www` and does the redirect properly.

The middleware still redirects `www.<marketing host>` to the apex if such a
request ever reaches the app. That is a safety net for the day `www` does point
at the service; it is not what handles `www` in this setup.

With DNS in place, set:

```
MARKETING_HOST=readysetamen.com
APP_HOST=app.readysetamen.com
APP_URL=https://app.readysetamen.com
```

`APP_URL` matters more than it looks: waiver signing links are built from it, so
it must be the domain parents will actually open.

---

## What is free and what is paid

The business model in one sentence: **build your first trip free; pay once to
run it.**

Free setup is the real application on the real database — not a demo, not a
trial that expires. Nothing is deleted or locked for not paying, gates sit on
actions rather than on reading, and a church can always see and edit what it
has already entered, medical notes and emergency contacts included.

### Free setup includes

| | |
| --- | --- |
| Organization | Create it, edit it, open its settings |
| Trips | **One trip**, fully editable — dates, destination, departure, notes |
| Attendees | **Up to 10**, by any method: manual, bulk paste, CSV, Excel |
| Import | Uploading, template downloads, the Google Sheets starter, column mapping, preview |
| Attendee detail | Guardians, parent contacts, emergency contacts, allergies, conditions, medications, dietary needs, notes |
| Emergency Info | Viewing **and editing** — never a paid feature |
| Payments | Trip cost, per-person amounts, paid / partial / unpaid / scholarship / waived, balances |
| Waivers | Create, edit, version, configure fields, and preview exactly as a parent sees it |
| Vehicles | Create, drivers, capacities, assignments, auto-assign |
| Lodging | Rooms, capacities, assignments, auto-assign |
| Itinerary | Create, edit, delete, reorder |
| Tasks | Create, complete, edit, delete, the default checklist |
| Prayer | Prayer focuses, Pray Over The Group, marking it done |
| Leader assignments | Responsibility planning |
| Everything else | Dashboard, Trip Readiness, outstanding-item warnings, every screen |

### Lifetime access is required for

| Action | Why it is the line |
| --- | --- |
| A second trip | One trip is enough to see the product work |
| Attendee #11 | The group is real now |
| Generating a waiver signing token or URL | Sending a real parent a real link |
| Inviting additional leaders | More than one person running the trip |
| Creating or recording a headcount | Standing beside a van counting students |
| Trip packet and printable reports | Rosters, emergency sheets, missing forms, outstanding payments — paper going out the door |

Nothing else is gated. Login, password reset, organization creation and
settings, the first trip, attendees 1–10, every entry method, template
downloads, editing, deletion, and all viewing stay open.

### Where the rules live

One module: **`src/lib/entitlement.ts`**. It is pure policy — no database, no
secrets — so the UI and the server action behind it ask the same function, and a
hidden button and a blocked action cannot disagree.

```
hasFullAccess(organization)
canCreateTrip(organization, existingTrips)
canAddAttendee(organization, currentCount, adding)
canCreateSigningLink(organization)
canRunHeadcount(organization)
canInviteLeader(organization)
canGenerateTripPacket(organization)
freeAttendeeSpotsLeft(organization, currentCount)
```

Enforcement is in **`src/lib/access.ts`**, beside the tenancy checks, so an
action that resolves its organization has already resolved its entitlement — a
gate can never be answered from an id the caller supplied. It redirects rather
than returning a flag, because a caller cannot forget to check a redirect.

Counted limits go through **`src/lib/capacity.ts`**, which takes a Postgres
advisory lock on the organization and does the count and the write in one
transaction. Without it, twenty simultaneous requests produce fifteen people
instead of ten — `tests/limits.test.ts` asserts exactly that.

The signing-link service checks entitlement itself, inside the function that
mints the token, so no future caller can reach a usable link by forgetting a
check of its own.

## Price

One place: `src/lib/pricing.ts`.

```
LAUNCH_PRICE_CENTS = 1499     $14.99 — lifetime, during launch
REGULAR_PRICE_CENTS = 3900    $39 — the planned regular price
```

The marketing page, the unlock screen, and the Stripe session all read from
there, so they cannot disagree. **The amount is always decided on the server.**
Nothing a browser sends is used to build a Checkout session.

---

## Stripe

Hosted Checkout, one-time payment, no subscriptions. Card details never reach
this application.

### Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | to sell anything | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | to grant access | `whsec_…` from the endpoint you create |
| `STRIPE_PRICE_ID` | optional | A `price_…` from your dashboard. Without it the price is built inline from `pricing.ts` |

With none of them set the app runs normally and the unlock page says purchasing
is not available yet. That is how the demo and the test suites run.

### Setting up the endpoint

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://app.readysetamen.com/api/stripe/webhook`
3. Event: **`checkout.session.completed`** (nothing else is needed)
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

### What actually grants access

Only the webhook. The browser's return from Checkout proves nothing — anyone can
open the success URL — so that page reads the database and reports what it
finds. If the webhook has not landed yet it says the payment is going through
rather than claiming an activation that has not happened.

The webhook:

- verifies Stripe's signature over the raw bytes before parsing anything;
- ignores any session that is not `payment_status: paid`;
- finds the organization from session metadata written server-side at checkout;
- is safe to replay — the checkout session id is unique in the database, so a
  redelivery records nothing and grants nothing twice;
- returns 500 only on a real failure, so Stripe retries.

`tests/billing.test.ts` exercises all of that, including a tampered payload, a
forged secret, an expired timestamp, and a duplicate delivery.

---

## Entitlements

`Organization.entitlement`, because access belongs to the church. When an owner
buys, every leader they invite is covered and nobody pays twice.

| State | Meaning |
| --- | --- |
| `FREE_SETUP` | A real account that has not paid yet |
| `LIFETIME` | A completed Stripe purchase |
| `MANUAL_LIFETIME` | The same access, granted from the CLI |
| `DEMO` | The showcase church, which has no purchase at all |

Every grant also writes a `Purchase` row — an append-only record of how a church
got its access, with Stripe's identifiers for reconciliation. A manual grant is
recorded as `MANUAL_GRANT` with a reason, so nothing ever reads a gift as
revenue.

### Granting access by hand

For a pilot church, a complimentary account, or a support case. There is no
admin panel and no HTTP route:

```bash
npm run grant -- <organization-slug> "pilot church, spoke 3 Sep"
npm run grant:status -- <organization-slug>
```

### The demo church

Runs on `DEMO` — paid functionality, no faked Stripe purchase, and the same code
paths, authorization, and waiver flows as any real church. A payment can never
convert it away from `DEMO`; `tests/billing.test.ts` asserts that.
