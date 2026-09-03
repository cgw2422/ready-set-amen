# Ready. Set. Amen.

**Keep the trip together.**
The faith-first trip planner for church groups.

Ready Set Amen helps a church leader run one trip from preparation through
getting everyone home: people, waivers, payments, vehicles, rooms, itinerary,
tasks, headcounts, emergency information, printable packets — and, as the last
preparation step, praying over the group.

It is a **mobile-first responsive web app**. No native apps, no AI, no SMS.

---

## Quick start

```bash
cp .env.example .env         # point DATABASE_URL at a Postgres 14+ database
npm install
npm run db:migrate           # or: npm run db:push
npm run seed                 # a church, a trip, 42 people, a real waiver
npm run dev
```

Then sign in as `leader@example.church` / `readysetamen2026`.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon, Supabase, anything) |
| `APP_URL` | yes in production | Public base URL — used to build waiver signing links |
| `RESEND_API_KEY` + `MAIL_FROM` | no, but see below | Transactional email. Without it, leaders share waiver and invitation links with **Copy Link** — but self-service password reset cannot deliver, so an owner has to issue reset links from organization settings. |

---

## Deploy

One-click-ish on Railway: Postgres, migrations on boot, `$PORT` binding, and a
health check are all pre-configured. Boot migrates and serves; it never writes
sample data.
See **[`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md)** — about five minutes.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma ·
PostgreSQL. Sessions and password hashing are first-party (`scrypt` + opaque
cookie tokens); there is no per-user auth vendor, no e-signature vendor, and no
AI dependency, which is what makes a $39 lifetime price viable.

Full reasoning, schema, security review, routes, and the readiness formula:
**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

---

## The waiver system

The one part of this app with real legal weight, so it is built around
immutability:

* Templates live at the organization level; **every save writes a new
  append-only version** with a SHA-256 content hash.
* A trip pins one *version*. Editing a template never changes what someone
  already signed.
* Signing links are 256-bit tokens stored only as hashes, carried in the path,
  single-use, expiring, revocable, and rate limited. Every failure mode renders
  one identical page so the route can't be used to probe for valid tokens.
* Signers need no account. Three steps on a phone, adult and guardian modes
  stated plainly, typed legal name plus optional drawn signature, explicit
  electronic-records consent.
* Signing is one transaction that re-validates everything server-side and
  writes an immutable `SignedWaiver` carrying its own copy of the document,
  the acknowledgements, the timestamp, the IP, and the user agent.

> Ready Set Amen provides electronic waiver collection tools. Organizations are
> responsible for ensuring their waiver language and processes meet applicable
> legal requirements. This is not legal advice.

No waiver language is ever generated for you.

---

## Marketing site and pricing

`readysetamen.com` is the public landing page and `app.readysetamen.com` is the
application — one Next.js build on one Railway service, split by hostname in
`src/middleware.ts`. With the host variables unset, one host serves everything,
which is how local development and the tests run.

The product is **$14.99 once, for lifetime access**, with no subscription.

**Free setup:** one trip, up to 10 attendees, manual entry, CSV and Excel
import, downloadable templates, a Google Sheets starter, and the whole planning
experience — waivers built and previewed, vehicles, rooms, itinerary, tasks,
prayer, payments, emergency info, Trip Readiness.

**$14.99 lifetime unlocks:** unlimited trips, unlimited attendees, electronic
waiver signing, live headcounts, multiple leaders, and trip packets and
operational reports.

Nothing is ever deleted or locked for not paying. The rules live in one place,
`src/lib/entitlement.ts`, which the UI and every server action both read.

See **[`docs/PRICING-AND-DOMAINS.md`](docs/PRICING-AND-DOMAINS.md)** for DNS,
Stripe setup, the full free/paid table, and how to grant access by hand.

---

## Importing attendees

Churches already have their people in a spreadsheet. **People → Import CSV /
Excel** reads `.csv` and `.xlsx`, auto-maps the columns it recognises, lets you
fix the rest, and shows a validated preview before anything is written. Import
templates download from the app; a Google Sheets starter appears when
`GOOGLE_SHEETS_TEMPLATE_URL` is set.

The parser is first-party and deliberately cannot evaluate a formula, run a
macro, or reach the network. See
**[`docs/ATTENDEE-IMPORT.md`](docs/ATTENDEE-IMPORT.md)**.

---

## The demo church

A permanent showcase organization — 50 fictional people on a youth convention
trip, 91% ready, with a real punch list still on the dashboard. It is created by
a command, never by a deploy:

```bash
DEMO_PASSWORD='a strong password you choose' npm run demo:seed
npm run demo:status
DEMO_PASSWORD='…' npm run demo:reset          # rebuilds only the demo, never a real church
```

It runs through the same authorization checks and the same waiver signing path
as any real church, and every person in it is invented.
See **[`docs/DEMO.md`](docs/DEMO.md)**.

---

## Platform admin

`/admin` shows how the business is doing — accounts created, churches created,
trips started, purchases and revenue — with the demo organization excluded from
every number. Access is a role on the account, granted from a shell:

```bash
npm run admin:grant -- you@example.com        # after signing up normally
```

It is read-only and cannot look inside a church: no attendee records, no medical
or emergency information, no waiver answers, no tokens. Owning a church grants
nothing there, and holding it grants nothing in any church.
See **[`docs/PLATFORM-ADMIN.md`](docs/PLATFORM-ADMIN.md)**.

---

## Tests

```bash
npm test                                      # pure logic: readiness, auto-assign, crypto, waiver content
TEST_DATABASE_URL=... npm run test:integrity  # waiver integrity, against a real database
TEST_DATABASE_URL=... npm run test:security   # tenancy, injection, XSS, tokens, rate limiting
TEST_DATABASE_URL=... npm run test:accounts   # password reset, invitations, roles, waiver gate
TEST_DATABASE_URL=... npm run test:demo       # demo isolation, reset safety, signing security
TEST_DATABASE_URL=... npm run test:billing    # entitlements, webhook signatures, idempotency
TEST_DATABASE_URL=... npm run test:limits     # free limits under concurrent requests
TEST_DATABASE_URL=... npm run test:admin      # platform metrics, demo exclusion, data boundary
npm run test:e2e                              # full walkthrough at 390px
node tests/day-of-trip.mjs                    # the morning-of workflow, timed
node tests/accessibility.mjs                  # targets, contrast, keyboard, 200% text
node tests/accounts-e2e.mjs                   # reset + invitations in the browser (dev server)
node tests/free-setup.mjs                     # the free-to-paid boundary, attacked directly
node tests/admin-e2e.mjs                      # platform authorization, attacked directly
```

The browser suites need a running server; point them with `E2E_BASE_URL`.

* **Waiver integrity** proves the guarantees that only a database can: a used
  link cannot be replayed, a tampered version is refused, editing a template
  never alters a signed record, and two simultaneous submissions produce exactly
  one signature.
* **Day-of-trip** plays a youth pastor in a parking lot at 6:30am and times each
  step, so slow paths show up as numbers.
* **Accessibility** measures touch targets, computes WCAG contrast ratios,
  tabs through forms, and re-renders at 200% text.
* **Accounts** proves reset tokens expire, cannot be replayed, and take every
  session down with them; and that invitations are single use, expiring and
  revocable.

---

## Scope

**In V1:** organizations, trips, attendees and guardians, electronic waivers,
document requirements, payment *tracking*, vehicles, rooms, itinerary, leader
assignments, preparation tasks, prayer, headcount mode, emergency information,
printable trip packets and reports.

**Deliberately not in V1:** native apps, AI of any kind, SMS, group chat, a
church membership database, giving, parent accounts, permission matrices,
attendee payment processing, arbitrary PDF editing.
