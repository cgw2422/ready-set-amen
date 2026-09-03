# The platform admin area

`/admin` answers one question: **how is Ready Set Amen doing as a business?**

How many people have signed up, how many churches exist, how many trips have
been started, how many bought lifetime access, and what has actually been
charged. It is not a CRM, and it deliberately cannot look inside a church.

---

## Getting access

There is no password, no secret URL, and no self-service. Access is a role on
the account, granted from a shell on the deployment:

```bash
npm run admin:grant  -- you@example.com     # after the account has signed up normally
npm run admin:list
npm run admin:revoke -- you@example.com
```

The account signs in through the ordinary login with its own password. Granting
the role never sets, reads or prints a password, and the CLI refuses politely if
no such account exists.

On Railway, run these from the service shell so `DATABASE_URL` is already set.

Why a shell command and not a settings screen: the role is what guards the
platform numbers, so the only way to hand it out is to already have deploy
access. There is no HTTP route that can grant it.

### What the role is, and is not

`User.platformRole` (`USER` | `PLATFORM_ADMIN`) is about Ready Set Amen itself.
`OrganizationMember.role` (`OWNER` | `LEADER`) is about one church. Neither is
derived from the other, in either direction:

* Owning a church — even a paid one — grants nothing at `/admin`.
* Being a platform admin grants nothing inside any church. It adds no
  membership, opens no roster, and changes no organization's entitlement.
* Revoking the platform role leaves the person's own church untouched.

### How it is enforced

Every page under `/admin` calls `requirePlatformAdmin()` itself and re-reads the
role from the database on every request. The layout checks too, but a layout is
not an authorization boundary in the App Router, so no page relies on it.

A visitor without the role gets a plain **404**, the same as a URL that does not
exist — a signed-in leader poking at `/admin` learns nothing from the response.
Signed-out visitors are sent to sign in.

Nothing here trusts the browser. There is no admin flag in a cookie, in
`localStorage`, in a header, in the query string or in React state, so there is
nothing to forge; `tests/admin-e2e.mjs` attacks each of those on purpose.
Because the role is read per request, a revoke closes the door immediately —
the admin does not have to be signed out first.

---

## What the pages show

### Dashboard — `/admin`

All time first, because that is what the page is for:

| Metric | Definition |
| --- | --- |
| **Accounts created** | Real user accounts, ever |
| **Organizations created** | Real churches, ever |
| **Trips started** | Trips inside real churches, ever |
| Lifetime purchases | Completed Stripe checkouts |
| Free setup | Churches still on the free plan |
| Conversion rate | Real churches with a Stripe purchase ÷ real churches created |
| Lifetime revenue | Sum of what Stripe actually charged |
| Total attendees / Signed waivers | Counts only |
| Manual lifetime | Churches granted access by hand |
| Demo organizations | Excluded from everything else on the page |

Underneath: rolling 7-, 30- and 90-day windows, and a recent-activity feed of
signups, new churches, new trips and purchases.

### Organizations — `/admin/organizations`

Every church with its plan, owner email, and counts of trips, attendees and
signed waivers. Searchable by name, slug or owner email; filterable by plan;
sortable. A detail page adds the member list and that church's purchase history.

### Accounts — `/admin/accounts`

Every account with the churches it belongs to and its role in each. No password
material of any kind is loaded, so none can be shown.

### Purchases — `/admin/purchases`

Every purchase, Stripe and manual, with the amount charged and the Stripe
checkout session and payment intent IDs for support. Manual grants show the
reason they were granted instead.

---

## Definitions worth pinning down

**Real, and how demo data is excluded.** Every number on the dashboard filters
on `Organization.isDemo` and `User.isSystem` — durable database columns set when
the demo is seeded. Nothing guesses from an email address or a name, so renaming
the demo church or seeding a second one changes nothing.

**Revenue is what Stripe charged.** Each purchase stores its own
`amountCents`, so revenue is a sum of real charges, not a customer count
multiplied by today's price. Changing the price later totals correctly, and the
launch price does not have to be remembered anywhere.

**A manual grant is never a sale.** `MANUAL_LIFETIME` is recorded as
`MANUAL_GRANT` with the reason attached. It never counts as a conversion and
never adds revenue — a comped pilot church cannot quietly inflate the numbers.

**Last activity** is the most recent of a church's own `updatedAt` and its
trips' `updatedAt`; for an account it is the last successful sign-in. Both come
from timestamps the app already keeps. There is no click tracking, no analytics
script, and no third-party service anywhere in this area.

**Refunds are not tracked.** Lifetime revenue is gross. If a refund is issued in
Stripe, this page will not know about it — check Stripe for net.

---

## What this area cannot show

The queries name their columns explicitly and never select a whole row, so the
following are absent by construction rather than filtered out afterwards:

medical conditions · medications · allergies · dietary needs · emergency
contacts · insurance information · waiver answers · signature images or typed
signatures · waiver signing tokens · password hashes · password reset tokens ·
session tokens · invitation tokens · Stripe secret keys · card data (which the
app never receives at all).

A platform admin sees that a church has 47 attendees and 41 signed waivers. They
cannot see who those people are, and there is no impersonation, no attendee
browser and no waiver browser to add up to it a different way.

The whole area is also **read-only**. There is no server action and no route
handler under `/admin`: it cannot change an entitlement, a role, a church or a
person. Granting lifetime access by hand is still `npm run grant`, from a shell,
with a reason recorded.

---

## Tests

```bash
TEST_DATABASE_URL=... npm run test:admin      # metrics, demo exclusion, and the data boundary
npm run test:admin-e2e                        # authorization, through a real browser
```

`tests/admin.test.ts` builds churches, purchases and a demo organization and
asserts the arithmetic by delta, checks that a manual grant is not a conversion,
that revenue sums differing prices correctly, and that a list of forbidden field
names appears in no admin response.

`tests/admin-e2e.mjs` proves the other half: signed out, an owner, and a leader
in a paid church all get 404 — by navigating and again by requesting directly
with their own session cookie — and forged cookies, `localStorage`, request
headers and query strings change nothing. It then grants the role from the CLI,
confirms all four pages open without signing in again, revokes it, and confirms
they close again.
