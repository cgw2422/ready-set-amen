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
| `www.readysetamen.com/*` | 308 to `readysetamen.com/*` |
| `readysetamen.com/orgs/…` | 307 to `app.readysetamen.com/orgs/…` |
| `app.readysetamen.com/` | 307 to `/orgs` — someone signed in wants their trips |
| `/api/*`, `/legal/*`, `/_next/*` | Served from whichever host asked |

**With either `MARKETING_HOST` or `APP_HOST` unset, nothing is redirected** and
one host serves everything. That is how local development, the test suites, and
a bare `*.up.railway.app` domain all work — the split only switches on once you
have both domains.

### DNS

| Record | Name | Value |
| --- | --- | --- |
| CNAME | `@` (or ALIAS/ANAME) | your Railway domain |
| CNAME | `www` | your Railway domain |
| CNAME | `app` | your Railway domain |

Add all three as custom domains on the same Railway service, then set:

```
MARKETING_HOST=readysetamen.com
APP_HOST=app.readysetamen.com
APP_URL=https://app.readysetamen.com
```

`APP_URL` matters more than it looks: waiver signing links are built from it, so
it must be the domain parents will actually open.

---

## What is free and what is paid

Free setup is the real application on the real database — not a demo, not a
trial that expires. A church signs up, builds its trip, and sees the dashboard
fill in. Nothing is ever deleted or locked for not paying, and declining costs
them nothing they had already entered.

**Free, always:** creating the organization and trip, trip details, guardians,
medical and emergency information, waiver templates, vehicles, rooms, itinerary,
tasks, prayer focuses, payments tracking, the dashboard, and Trip Readiness — up
to the first **10 attendees**.

**Requires lifetime access:**

| Action | Why it is the line |
| --- | --- |
| Attendee #11 | The group is real now |
| Generating waiver signing links | Sending a real parent a real link |
| Inviting other leaders | More than one person running the trip |
| Starting a headcount | Standing beside a van counting students |
| The trip packet and printed reports | Paper going out the door |

The gate is `requirePaidFeature` in `src/lib/access.ts`. It redirects rather
than returning a flag, so a caller cannot forget to check it, and it runs before
any work happens. Every gated path is covered by `tests/free-setup.mjs`,
including typing the URL directly.

---

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
