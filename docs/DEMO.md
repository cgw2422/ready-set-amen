# The demo organization

**Ready Set Amen Demo Church** is a permanent showcase church you can sign into
and click around: a 50-person youth convention trip, most of the way ready, with
real work still visible on the dashboard.

Everything about it is ordinary application data. It is created by the same
Prisma models, read through the same authorization checks, and its waivers were
signed through the same signing-link code path a real parent uses. The only
thing that marks it is `Organization.isDemo`, and that flag exists for exactly
one reason: so the destructive reset tooling can refuse to touch anything else.
It is never selected into a page's props, never rendered, and never changes
behaviour.

---

## Creating it

The demo is created deliberately, by a command you run — never by a deploy.
Nothing in the boot sequence writes sample data.

```bash
DEMO_PASSWORD='a strong password you choose' npm run demo:seed
```

`DEMO_PASSWORD` is read from the environment and never written to the
repository, a log, or a build artifact. If you omit it, the command generates a
strong password and prints it **once, to your terminal**; save it then, because
it is stored only as a scrypt hash and cannot be shown again.

On Railway, run it from the service shell (or `railway run` locally against the
production `DATABASE_URL`).

### Checking on it

```bash
npm run demo:status
```

### Changing the password later

```bash
DEMO_PASSWORD='the new password' npm run demo:password
```

This rehashes the password and **signs out every existing demo session**, so a
password you have shared with someone stops working the moment you change it.

---

## Resetting it

```bash
DEMO_PASSWORD='a strong password you choose' npm run demo:reset
```

That is the exact command. It deletes and rebuilds the demo, restoring the same
polished starting state.

There is no HTTP endpoint for this — no route, no button, nothing reachable from
a browser. Reset exists only as a server-side command, so it needs shell access
to the deployment.

**What it will and will not touch.** `deleteDemoOrganization()` looks up the
organization by its slug, verifies `isDemo === true`, and only then deletes it
by id. If a row with that slug exists but is not flagged as demo, the tooling
throws and deletes nothing — a real church that happens to occupy the slug
cannot be destroyed by running the wrong command. Every other organization in
the database is outside the query entirely.

If you omit `DEMO_PASSWORD` on a reset, a new password is generated and printed
once. The old password does not survive a reset — the account is recreated.

---

## What is in it

| | |
| --- | --- |
| Organization | Ready Set Amen Demo Church (Columbus, OH) |
| Trip | Ohio Youth Convention — always seeded ten weeks out, so it never goes stale |
| People | 50 — 42 students, 8 leaders |
| Families | 14 sibling groups; several guardians with more than one child on the trip |
| Guardians | 42, with contact details |
| Medical | Allergies, conditions, medications, and dietary needs spread across the group |
| Transportation | 7 vehicles with named drivers and seat assignments |
| Lodging | 13 rooms with assignments, each leader-required room given a leader |
| Payments | A mixture: paid, partial, unpaid, and 3 scholarships |
| Waivers | One template, one pinned version; 46 signed, 4 outstanding (1 not sent, 2 sent, 1 opened) |
| Other documents | 4 requirements, 3 of them required |
| Schedule | 25 itinerary items across 4 days |
| Preparation | 12 tasks + "Pray Over The Group" |
| Leader assignments | 8 roles, 6 filled |
| Headcount | 3 completed sessions |
| Prayer | Several prayer focuses, deliberately outside the readiness score |

### Starting state: 91% ready

| Category | | Weight |
| --- | --- | --- |
| Attendee information | 96% — 48 / 50 | 20 |
| Waivers | 92% — 46 / 50 signed | 25 |
| Required forms | 80% — 120 / 150 | 10 |
| Payments | 88% — $3,940 / $4,465 | 15 |
| Transportation | 98% — 7 / 7 vehicles ready | 10 |
| Lodging | 97% — 48 / 50 assigned | 10 |
| Leader assignments | 75% — 6 / 8 | 5 |
| Preparation tasks | 83% — 10 / 12 | 5 |

Outstanding on the dashboard, in this order:

1. 2 missing emergency contacts
2. 4 waivers unsigned
3. 30 forms outstanding
4. $525 outstanding
5. 1 person without a vehicle
6. 2 people without a room
7. 2 preparation tasks still open

Plus **Pray Over The Group**, which is deliberately not done — and which sits
outside the readiness percentage entirely, exactly as it does for a real church.

### Driving it to READY. SET. AMEN.

The demo ships in the "almost ready" state, and every remaining item is
finishable using nothing but the normal app: sign the four waivers from the
waiver queue, add the two emergency contacts, mark the remaining forms and
payments, seat the last person, assign the last two beds, fill the two open
leader roles, and check off the two tasks. There is no demo-only mode, no
shortcut, and no second module — it is the same work a youth pastor would do,
which is the point. `npm run demo:reset` puts it back.

---

## Everything in it is fictional

Every person, guardian, phone number, and email address is invented. Phone
numbers use the 555-01xx range reserved for fiction; email addresses use
`example.com`, reserved by RFC 2606. No real person, church, hotel, or
convention is represented.

**The waiver wording is demonstration text.** The template opens with a notice
saying so, the template's description repeats it, and it is stored in the
signed snapshot of every demo signature. It has not been reviewed by an attorney
and must not be used for a real trip — a real church supplies its own wording
and accepts responsibility for it before it can send anything.

---

## Isolation

The demo is not special-cased anywhere:

- **No shortcuts.** Reading the demo goes through the same
  `organization.members.some({ userId })` check as any other organization. A
  signed-in stranger resolving `/orgs/ready-set-amen-demo` gets nothing back,
  because they are not a member.
- **Not discoverable.** Nothing lists organizations you do not belong to, and
  `isDemo` is not exposed by any route, page prop, or API response.
- **Both directions.** The demo owner is a member of the demo and nothing else,
  so signing in as the demo cannot reach a real church either.
- **No shared rows.** Every attendee, guardian, vehicle, room, waiver, and
  signature is scoped to the demo organization by foreign key.
- **Real signing security.** The 46 signed waivers went through
  `issueSigningLink` and `recordSignature`: hashed single-use tokens, pinned
  template versions, content hashes, and a full audit snapshot per signature. An
  outstanding demo link still expires, still burns on use, and still cannot be
  guessed.

To share the demo with someone, invite them to it from organization settings
like any other leader. That is the only way in.

`tests/demo.test.ts` holds these as assertions — including that reset cannot
touch a non-demo organization, that a stranger cannot resolve the demo, that
demo rows never appear inside another organization's queries, and that no
literal password lives in the source.

```bash
TEST_DATABASE_URL=postgresql://… npm run test:demo
```
