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
| `RESEND_API_KEY` + `MAIL_FROM` | no | Optional transactional email. Without them, leaders use **Copy Link**, which is the primary V1 path. |

---

## Deploy

One-click-ish on Railway: Postgres, migrations on boot, `$PORT` binding, a
health check, and optional demo data are all pre-configured.
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

## Tests

```bash
npm test          # readiness engine, auto-assign, crypto, waiver content
npm run test:e2e  # full browser walkthrough at 390px (needs a running dev server)
```

The end-to-end script signs a waiver as a parent with no account, checks that
the link dies afterwards, checks that an invented token leaks nothing, runs
auto-assign for vehicles and rooms, runs a headcount, prints a packet, completes
the prayer step, and asserts no page scrolls horizontally on a phone.

---

## Scope

**In V1:** organizations, trips, attendees and guardians, electronic waivers,
document requirements, payment *tracking*, vehicles, rooms, itinerary, leader
assignments, preparation tasks, prayer, headcount mode, emergency information,
printable trip packets and reports.

**Deliberately not in V1:** native apps, AI of any kind, SMS, group chat, a
church membership database, giving, parent accounts, permission matrices,
attendee payment processing, arbitrary PDF editing.
