# Ready. Set. Amen. — Technical Architecture (V1)

**Keep the trip together.**
The faith-first trip planner for church groups.

This document is the answer to the "BEFORE CODING" checklist in the product
specification. It is the contract the V1 implementation is built against.

---

## 1. Specification review — what V1 actually is

Ready Set Amen is a **single-tenant-per-organization, multi-organization SaaS**
that manages the lifecycle of one church trip: prepare → travel → return.

The product has exactly one hard "wow" feature that has to be *right*, and a
large surface of features that have to be *fast and simple*:

| Tier | Area | Why |
| --- | --- | --- |
| **Critical / legally serious** | Electronic waivers (template → version → link → signature → immutable record) | Minors, medical data, signatures, audit trail |
| **Core daily value** | Trip dashboard + readiness, attendees, vehicles, rooms, itinerary, tasks, headcount, emergency info, printables | This is the "keep the trip together" promise |
| **Tracking only in V1** | Payments, non-waiver document requirements | Explicitly not processed / not digitally completed in V1 |
| **Intentional, non-gamified** | Prayer | A meaningful closing step, never a score |

Things the spec correctly excludes and this build does **not** contain: native
apps, AI of any kind, SMS, chat, church membership/giving, parent accounts,
role permission matrices, payment processing, arbitrary PDF editing.

### Product-level observations worth stating up front

1. **Waivers are the only feature with real legal exposure.** Everything else
   can be corrected by a leader typing a number again. A signed waiver cannot.
   So the waiver subsystem gets append-only storage, immutable version
   snapshots, and an audit trail; the rest of the app gets ordinary CRUD.
2. **Medical data is the highest-sensitivity data in the app**, and it belongs
   to minors. It is never rendered on a public route, never logged, and never
   included in a URL.
3. **Trip Readiness is a UX device, not an accounting system.** It must be
   cheap to compute (one query set per dashboard load) and must never block a
   leader from leaving on a trip.

---

## 2. Recommended technical stack

The stack is chosen against one dominating constraint: **near-zero variable
cost at 100–5,000 organizations**, with a $39 lifetime price point.

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router) + React 19, TypeScript** | One deployable unit for UI + API. Server Components keep sensitive data server-side by default — medical fields are rendered on the server and never shipped as JSON to a public bundle. Server Actions remove the need for a hand-written REST layer. |
| Styling | **Tailwind CSS v4** with brand tokens in CSS variables | No runtime cost, no CSS-in-JS hydration overhead, trivial to enforce the palette. |
| Fonts | **League Spartan** (display) + **Inter** (UI), self-hosted via `next/font/google` | Self-hosting = no third-party request on a parking-lot LTE connection. |
| Database | **PostgreSQL** (Neon / Supabase free tier in production) | Real relational integrity, cascade deletes for the "delete a trip and its personal data" requirement, `serializable`-capable transactions for signing. Free tier covers V1 comfortably. |
| ORM | **Prisma 6** | Typed schema, migrations, good `onDelete: Cascade` ergonomics. |
| Auth | **First-party session cookies** — `scrypt` password hashing (Node built-in `crypto`), opaque 256-bit session tokens stored hashed in Postgres | No Auth0/Clerk per-MAU cost. No JWT revocation problem: sessions are rows, so "log out everywhere" and org deletion are trivial. |
| Email | **Optional.** Pluggable `Mailer` interface; `console` driver by default, Resend driver if `RESEND_API_KEY` is set | The app is fully functional with copy-link only, exactly as the spec requires. |
| PDF | **Print CSS** (`@media print`) on dedicated `/print/*` routes | Zero server cost, works from any phone's share sheet ("Print → Save to PDF"). The print routes are plain server-rendered HTML, so a real PDF renderer can be pointed at the same URLs later without touching the data layer. |
| Signatures | **HTML canvas → PNG data URL**, plus typed legal name, stored on the signature record | No DocuSign/HelloSign per-envelope fee. |
| Hosting | **Vercel Hobby/Pro + Neon** (or any Node host + Postgres) | Nothing in the code is Vercel-specific; it is a standard Next.js server build. |

**Deliberately rejected:** OpenAI/Anthropic APIs, Twilio, Clerk/Auth0,
DocuSign, Mapbox/Google Maps, S3 (V1 stores no uploaded files — the only
binary is a small signature PNG, kept inline in Postgres).

### Cost model at 1,000 organizations

Neon free/launch tier + Vercel Hobby/Pro + no per-user services ⇒ fixed
double-digit monthly cost, no per-signature, per-message, or per-seat fee.
A $39 lifetime price is viable because the marginal cost of an organization
is a few megabytes of Postgres.

---

## 3. Relational schema

Full definition lives in [`prisma/schema.prisma`](../prisma/schema.prisma).
Summary of the 27 models and the reasoning behind the non-obvious ones.

### Identity & tenancy

```
User ──< OrganizationMember >── Organization ──< Trip
User ──< Session
```

* `Organization` is the tenancy boundary. **Every** authorization check in the
  app resolves to "does this user have an `OrganizationMember` row for the
  organization that owns this trip?"
* `OrganizationMember.role` is `OWNER | ADMIN | LEADER`. V1 deliberately keeps
  this coarse — the spec forbids "complicated permissions". Emergency/medical
  data requires any authenticated member of the owning organization.
* `Session` stores `tokenHash` (SHA-256 of the cookie value), never the token.

### People

```
Trip ──< Attendee ──< Guardian
                 ├──< PaymentRecord
                 ├──< AttendeeDocumentStatus >── DocumentRequirement
                 ├──< VehicleAssignment >── Vehicle
                 ├──< RoomAssignment >── Room
                 ├──< WaiverRecipient ──< WaiverSigningLink
                 │                   └──  SignedWaiver
                 └──< HeadcountRecord >── HeadcountSession
```

* `Attendee` is **trip-scoped, not org-scoped**. This is a real design decision:
  it keeps the schema simple, makes "delete the trip, delete the data" a single
  cascade, and matches how church trips actually work (a roster is assembled per
  trip). Re-use across trips is a copy, not a foreign key.
* `Attendee.isMinor` is stored, not derived, because date of birth is optional
  and a leader must be able to say "this is a minor" without one. When a DOB is
  present the UI derives the age and warns on mismatch.
* `Guardian` is a separate table (not two columns) because one parent commonly
  signs for several children — the "one parent, multiple kids" waiver flow keys
  off matching guardian email.
* Medical fields (`allergies`, `medicalConditions`, `medications`,
  `dietaryRestrictions`) live on `Attendee` and are only ever selected in
  authenticated server code.

### Waivers (the important part)

```
Organization ──< WaiverTemplate ──< WaiverTemplateVersion
                                          │
Trip ──< TripWaiverRequirement ───────────┘  (pins ONE version)
             │
             └──< WaiverRecipient ──< WaiverSigningLink
                        │
                        └── SignedWaiver ──< WaiverFieldResponse
```

* `WaiverTemplate` — the mutable, editable thing a leader manages.
* `WaiverTemplateVersion` — an **append-only snapshot** of every section of
  waiver text plus the required-field configuration, with a monotonically
  increasing `versionNumber` and a `contentHash` (SHA-256 of the canonical
  serialized content). Editing a template creates a new version; versions are
  never updated or deleted once any signature references them.
* `TripWaiverRequirement` joins a trip to a specific **version**, not a
  template. Editing the template later does not retroactively change what a
  trip is asking people to sign until a leader explicitly adopts the new
  version.
* `WaiverRecipient` is the per-attendee assignment and status row
  (`NOT_SENT → SENT → VIEWED → SIGNED`, plus `NOT_REQUIRED`, plus
  `SUPERSEDED`). It also carries `signerRole` (`SELF` for adults,
  `GUARDIAN` for minors).
* `WaiverSigningLink` is the credential (details in §5).
* `SignedWaiver` is the immutable record. It stores its **own copy** of the
  waiver text — `documentSnapshot` (JSON) and `documentHash` — so a signed
  waiver is readable and verifiable even if the template, the version, or the
  trip is later edited.
* `WaiverFieldResponse` stores the answers to required fields as one row per
  field, so a field can be added without a schema migration and so responses
  can be selectively suppressed from printouts.

### Logistics

`Vehicle`/`VehicleAssignment`, `Room`/`RoomAssignment`, `ItineraryItem`,
`Task`, `LeaderAssignment`, `PrayerFocus`, `HeadcountSession`/`HeadcountRecord`,
`DocumentRequirement`/`AttendeeDocumentStatus`, `PaymentRecord`.

Uniqueness constraints that matter:

* `@@unique([attendeeId, tripWaiverRequirementId])` on `WaiverRecipient` — one
  assignment per attendee per waiver requirement.
* `@@unique([attendeeId])` on `VehicleAssignment` and on `RoomAssignment` — an
  attendee rides in one vehicle and sleeps in one room. Reassignment is an
  upsert, which makes drag-and-drop idempotent.
* `@@unique([sessionId, attendeeId])` on `HeadcountRecord`.
* `@@unique([templateId, versionNumber])` on `WaiverTemplateVersion`.

Every child table cascades from its parent up to `Trip`, and `Trip` cascades
from `Organization`, so `DELETE FROM trips WHERE id = ...` genuinely removes
every piece of personal data for that trip — which is what the privacy section
of the spec requires. `SignedWaiver` is the one exception: it cascades too, but
deletion is gated behind an explicit typed confirmation in the UI, because
destroying signed records is a decision, not a click.

---

## 4. Waiver architecture in detail

### 4.1 Versioning

1. A leader creates `WaiverTemplate "2026 Student Ministry Release"`.
2. Saving content writes `WaiverTemplateVersion #1` with:
   * every section's text (intro, release, assumption of risk, medical
     authorization, photo release, emergency treatment, custom terms, footer),
   * each section's `enabled` flag,
   * the `requiredFields` configuration (which of the ~16 possible fields the
     signer must complete, plus custom questions and acknowledgement
     checkboxes),
   * `contentHash = sha256(canonicalJSON(content))`.
3. Editing the template creates version #2. **Version #1 is never mutated.**
   If no signature and no trip requirement references version #1, it may be
   garbage-collected; otherwise it is permanent.
4. `TripWaiverRequirement` pins the version in use for that trip. Adopting a
   newer version is an explicit action that marks existing unsigned recipients
   as needing the new version and leaves already-signed recipients alone
   (their status becomes `SUPERSEDED` only if the leader chooses to re-collect).

### 4.2 Signing links

* A link is a **32-byte cryptographically random token** (`crypto.randomBytes(32)`,
  base64url) → 43 characters. The database stores only `sha256(token)`; the raw
  token exists exactly once, in the URL handed to the leader.
* URL shape: `/sign/<token>` — the token is in the **path**, not a query
  parameter, so it does not land in `Referer` headers of third-party assets
  (and the signing page loads no third-party assets at all).
* Links carry `expiresAt` (default: trip end date + 30 days, configurable),
  `revokedAt`, `viewedAt`, `usedAt`, and `maxUses`.
* Enumeration protection: an invalid, expired, revoked, or already-used token
  returns the **same** generic "This signing link is no longer available"
  page. The route never distinguishes "wrong token" from "expired token" in
  its response body or status code, and never reveals a participant name
  before a valid token is presented.
* Rate limiting: token lookups are rate-limited per IP (in-memory sliding
  window in V1, swappable for Postgres/Upstash later). 30 attempts / 10 min.
* Regenerating a link revokes the previous one, so "the parent lost the text"
  is recoverable without leaving a live credential in a group chat.

### 4.3 The signing transaction

Signing is a single database transaction that:

1. Re-validates the token (hash lookup, expiry, revocation, use count).
2. Re-reads the pinned `WaiverTemplateVersion` and recomputes its
   `contentHash`; if the recomputed hash differs from the stored hash the
   signing is refused. (Defends against corrupted or tampered version rows.)
3. Validates every required field server-side (Zod), independent of the client.
4. Verifies the electronic-records consent checkbox and every configured
   acknowledgement checkbox are present.
5. Writes `SignedWaiver` with the full audit payload (§4.4).
6. Writes one `WaiverFieldResponse` per answered field.
7. Copies safe, non-medical answers back onto the `Attendee` **only where the
   attendee field is empty** (never overwriting a leader's entry).
8. Sets `WaiverRecipient.status = SIGNED`, marks the link used.

If any step fails the whole transaction rolls back — there is no state where a
recipient is marked signed without a durable record.

### 4.4 The signature record (audit trail)

`SignedWaiver` persists:

| Field | Purpose |
| --- | --- |
| `id` (cuid) | Unique signed-waiver ID, shown on the printed copy |
| `waiverTemplateVersionId` + `documentSnapshot` + `documentHash` | Exactly what was signed, immutably |
| `attendeeId`, `participantNameAtSigning` | Who it covers |
| `signerName`, `signerRelationship`, `signerEmail`, `signerRole` | Who signed and in what capacity |
| `typedSignature` | The typed legal name (primary signature evidence) |
| `drawnSignature` | Optional PNG data URL of the drawn signature |
| `signedAt` | Server timestamp (never client-supplied) |
| `ipAddress`, `userAgent` | Where/how, for the audit trail |
| `consentToElectronicRecords` + `consentText` | The ESIGN/UETA-style affirmative consent and the exact text consented to |
| `acknowledgements` (JSON) | Every checkbox key → label → checked |
| `WaiverFieldResponse[]` | The collected answers |

`SignedWaiver` rows are written once. The application contains no code path
that updates one. Correcting a signature means voiding it (a `voidedAt` +
`voidReason`, which keeps the record) and collecting a new one.

### 4.5 Retention and retrieval

* Signed waivers are retrievable at `/orgs/:org/trips/:trip/waivers/:signed`
  (authenticated) and printable at `/print/signed-waiver/:id`.
* The printed copy renders **from `documentSnapshot`**, not from the live
  template, so a printout in 2028 shows the 2026 language.
* PDF today = browser print-to-PDF. The print route is a clean, standalone HTML
  document, so swapping in a server-side renderer later is a pure addition.

### 4.6 Legal posture

The app displays, on the waiver builder and on every signing page:

> Ready Set Amen provides electronic waiver collection tools. Organizations are
> responsible for ensuring their waiver language and processes meet applicable
> legal requirements. This is not legal advice.

No waiver language is generated automatically. Sample templates (if added) are
labeled as starting points for the organization's own attorney to review.

---

## 5. Security concerns identified

| # | Concern | Mitigation in V1 |
| --- | --- | --- |
| 1 | Signing links are bearer credentials for minors' medical data | 256-bit tokens, hashed at rest, path-not-query, expiry, revocation, single-use by default, generic failure page, per-IP rate limit |
| 2 | Cross-organization data access (IDOR) | Every server action and page resolves the trip through `requireTripAccess(userId, tripId)`, which joins `Trip → Organization → OrganizationMember`. There is no code path that loads a trip by ID alone. |
| 3 | Medical/PII leakage into logs | A `logging.ts` allowlist; request logging records route + status only. Waiver field responses and medical fields are never passed to `console.*`. |
| 4 | Session theft | `httpOnly`, `secure` (in production), `sameSite=lax` cookie; 256-bit opaque token; SHA-256 at rest; 30-day sliding expiry; server-side revocation |
| 5 | Password attacks | `scrypt` (N=2^15) with per-user 16-byte salt; constant-time compare; per-IP + per-email login rate limit; identical error text for unknown email and wrong password |
| 6 | CSRF | Next.js Server Actions require a same-origin POST with an action ID; the session cookie is `SameSite=Lax`; the public signing POST additionally verifies the `Origin` header |
| 7 | Enumeration of attendees / orgs | No public listing routes. `/sign/<token>` is the only unauthenticated data route and it reveals nothing without a valid token. |
| 8 | Sensitive data in URLs | No route takes a name, email, DOB, or medical value as a query parameter. Print routes take IDs only and are authenticated. |
| 9 | Client-side trust | Every mutation re-validates with Zod on the server; capacity limits, required-field rules, and readiness are computed server-side |
| 10 | Right to erasure | Cascade deletes from `Trip` and `Organization`; a typed-confirmation delete flow; signed waivers deleted only through that explicit flow |
| 11 | Signature repudiation | Immutable snapshot + hash + consent text + timestamp + IP + UA; typed name required even when a drawn signature is provided |
| 12 | XSS through waiver language | Waiver text is rendered as React nodes from a tiny formatting subset. `dangerouslySetInnerHTML` appears nowhere in `src/`, enforced by a test, and a live payload is pushed through the builder in the browser walkthrough |
| 13 | SQL injection | Prisma parameterises everything; the one raw query (the rate limiter) uses a tagged template, tested with a `DROP TABLE` payload |
| 14 | Bulk link disclosure | Copying forty personal signing links to one clipboard invites pasting them into a group chat, handing every parent every child's link. The primary flow is a one-at-a-time queue; bulk export is secondary, behind a disclosure and an explicit warning |

### Rate limiting

Limits live in Postgres, not in process memory, so several app instances share
one budget. The whole check is a single atomic upsert against a fixed-window
counter — no Redis, no transaction, one round trip:

```sql
INSERT INTO rate_limit_counters (key, "windowStart", count, "expiresAt") VALUES (…, 1, …)
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN rate_limit_counters."windowStart" = … THEN count + 1 ELSE 1 END,
  …
RETURNING count
```

If the database is unreachable the limiter falls back to the per-process
sliding window rather than failing open entirely.

Two deliberate choices in the login limits:

* **Only failed attempts spend the budget.** A successful sign-in is not an
  attack signal, and charging for it locks out the legitimate user while barely
  slowing an attacker. A successful login also clears that account's counter.
* **The per-IP limit is deliberately loose (100 / 15 min) and the per-account
  limit tight (10 / 15 min).** The account limit is the real brute-force
  control. An entire church shares one NAT address on the building wifi, so an
  IP limit tight enough to stop a single attacker would lock out a staff
  meeting.

### Sessions

Signing in mints a new 256-bit token and **deletes the session the browser
arrived with**, so a fixated or previously captured cookie stops working at the
moment of login rather than lingering until it expires. Expired rows for that
user are purged at the same time.

Known, accepted V1 limitations (documented rather than hidden): fixed windows
mean an attacker can burst across a window boundary at up to 2x the limit
(irrelevant at these numbers, and it buys a one-query check); there is no 2FA;
there is no field-level encryption at rest beyond what the database provider
gives (Neon encrypts at rest).

---

## 6. Routes

### Authenticated application

```
/                                   Landing (marketing) or redirect to app if signed in
/signup  /login  /logout
/onboarding                         Create first organization
/orgs                               Organization switcher
/orgs/:orgSlug                      Trips list for the organization
/orgs/:orgSlug/settings             Organization profile + members
/orgs/:orgSlug/waivers              Waiver template library (org-level, reusable)
/orgs/:orgSlug/waivers/new
/orgs/:orgSlug/waivers/:templateId  Template editor + version history

/orgs/:orgSlug/trips/new
/orgs/:orgSlug/trips/:tripId                    Trip dashboard  (Home)
/orgs/:orgSlug/trips/:tripId/people             Roster
/orgs/:orgSlug/trips/:tripId/people/quick-add   Fast multi-row entry
/orgs/:orgSlug/trips/:tripId/people/:attendeeId Attendee detail (tabs incl. Emergency)
/orgs/:orgSlug/trips/:tripId/waivers            Waiver dashboard + link generation
/orgs/:orgSlug/trips/:tripId/waivers/:signedId  A signed waiver record
/orgs/:orgSlug/trips/:tripId/forms              Document requirements matrix
/orgs/:orgSlug/trips/:tripId/payments           Payment tracking
/orgs/:orgSlug/trips/:tripId/transportation     Vehicles + assignment
/orgs/:orgSlug/trips/:tripId/lodging            Rooms + assignment
/orgs/:orgSlug/trips/:tripId/itinerary          Schedule
/orgs/:orgSlug/trips/:tripId/tasks              Preparation checklist
/orgs/:orgSlug/trips/:tripId/prayer             Prayer focuses + Pray Over The Group
/orgs/:orgSlug/trips/:tripId/leaders            Leader assignments
/orgs/:orgSlug/trips/:tripId/headcount          Headcount sessions
/orgs/:orgSlug/trips/:tripId/headcount/:id      Live headcount screen
/orgs/:orgSlug/trips/:tripId/emergency          Emergency information
/orgs/:orgSlug/trips/:tripId/packet             Trip packet builder
/orgs/:orgSlug/trips/:tripId/settings           Trip settings + delete
```

### Print (authenticated, `@media print` optimized)

```
/print/trip/:tripId/packet?sections=...   Composed packet
/print/trip/:tripId/roster
/print/trip/:tripId/emergency
/print/trip/:tripId/vehicles
/print/trip/:tripId/rooms
/print/trip/:tripId/itinerary
/print/trip/:tripId/unsigned-waivers
/print/trip/:tripId/missing-forms
/print/trip/:tripId/outstanding-payments
/print/signed-waiver/:signedWaiverId
```

### Public (no account)

```
/sign/:token          The signing experience
/sign/:token/done     Confirmation
/legal/esign          Electronic records consent disclosure
```

---

## 7. Mobile navigation

A fixed bottom tab bar inside a trip, five targets, thumb-reachable, with
`env(safe-area-inset-bottom)` padding for iPhone. Its icon and button sizes are
in **pixels, not rem**: with iOS "larger text" turned on, rem-based chrome grew
until the five-slot bar was wider than the phone.

```
🏠 Home      👥 People      ➕ (quick action)      ✅ Tasks      ⋯ More
```

* **Home** — trip dashboard.
* **People** — roster.
* **➕** — a raised primary-green Quick Actions sheet: **Add Person**,
  **Run Headcount**, **Add Task**, **Add Itinerary Item**, **Add Vehicle**,
  **Add Room**. Each destination carries `?new=1` and opens with the form
  already expanded and focused, so it is two taps from anywhere in the trip to
  a cursor in an input.
* **Tasks** — preparation checklist (the path to the Prayer step).
* **More** — Waivers, Forms, Payments, Transportation, Lodging, Itinerary,
  Leaders, Packet, Trip Settings.

Rationale: the spec's high-priority functions (Headcount, Waivers, Emergency)
are one tap from the dashboard *and* from the ➕ sheet, which keeps the tab bar
at five items. On tablet/desktop the tab bar is replaced by a persistent left
sidebar with the full section list; no feature is mobile-only or desktop-only.

Touch targets are ≥44px, verified by `tests/accessibility.mjs` across every
screen. Headcount rows are ≥64px because they are tapped in motion.

### Accessibility

Every text tone was measured against the surfaces it actually sits on. Three
brand-derived tones failed WCAG AA for small text and were darkened
(`navy-faint` 3.65:1 → 5.51:1, `coral-deep` 4.03:1 → 5.67:1, `gold-deep`
2.60:1 → 5.09:1), and white-on-coral buttons (2.80:1) became navy-on-coral
(5.75:1), which keeps the brand colour rather than darkening it. The five brand
colours themselves are unchanged.

---

## 8. Trip Readiness calculation

Readiness is a weighted average of **enabled** categories. Weights and the
enabled/disabled flag live on the `Trip` row so an organization can turn off a
category it does not use (e.g. a day trip with no lodging).

| Category | Default weight | Complete when |
| --- | --- | --- |
| Attendee information | 20 | Attendee has first+last name, an emergency contact name **and** phone, and (for minors) a guardian name + at least one guardian contact method |
| Waivers | 25 | Every recipient row is `SIGNED` or `NOT_REQUIRED` |
| Required forms | 10 | Every `AttendeeDocumentStatus` is `COMPLETE` or `NOT_REQUIRED` |
| Payments | 15 | Attendee's `amountPaid ≥ amountDue`, or status is `PAID`/`SCHOLARSHIP`/`WAIVED` |
| Transportation | 10 | Every attendee has a `VehicleAssignment`, no vehicle is over capacity, and every vehicle has a driver |
| Lodging | 10 | Every attendee has a `RoomAssignment` and no room is over capacity |
| Leader assignments | 5 | At least one `LeaderAssignment` exists and every role marked `required` is filled |
| Preparation tasks | 5 | Every non-prayer task is `DONE` |

```
readiness = round( Σ(weightᵢ × completionᵢ) / Σ(weightᵢ) × 100 )
```

where `completionᵢ ∈ [0,1]` is that category's own ratio (e.g. 39 signed of 50
required = 0.78). A category with nothing to complete (no rooms defined and
lodging enabled) counts as **not applicable** and is dropped from both sums
rather than counted as 0 or 100 — a leader is not punished for a trip shape the
category does not fit.

### Prayer is outside the percentage

`Pray Over The Group` is a task with `isPrayerStep = true`. It is:

* **excluded** from the tasks category and from the readiness denominator,
* not shown with a count, a streak, or a score,
* surfaced only once the logistical readiness reaches 100%, with:

  > **You've checked the boxes.**
  > Now let's cover the trip in prayer.

* and on completion the app shows the branded state:

  > **READY. SET. AMEN.**
  > You're ready to go.

Below 100% the prayer step is still reachable (a leader may pray whenever they
want) — it is simply not promoted.

### Problem surfacing

The same single pass that computes readiness emits a list of `TripIssue`
objects — `{ severity, message, href }` — rendered on the dashboard in friendly
language: *"11 waivers still need signatures."*, *"3 attendees are missing
emergency contacts."*, *"1 hotel room is over capacity."* Each links straight to
the screen that fixes it.

---

## 9. Adult vs. guardian signing

The signing page is one route with two modes, decided by
`WaiverRecipient.signerRole`, which is derived from `Attendee.isMinor` when the
recipient row is created and can be overridden by the leader.

**Adult (`SELF`)**

> **Signing for yourself**
> Jordan Ellis — Nashville Mission Trip, June 14–21, 2026

The signer's name field is pre-filled with the participant name and the
relationship is fixed to "Self".

**Minor (`GUARDIAN`)**

> **Signing for: Maddie Ellis** (age 15)
> **Parent/Guardian:** ________________
> Relationship: Parent / Legal Guardian / Other

The page states plainly that the signer affirms they are the participant's
parent or legal guardian with authority to sign. Guardian name/email/phone are
required fields in this mode regardless of template configuration.

**One parent, several children.** After a guardian signs, the app looks for
other unsigned `WaiverRecipient` rows on the same trip whose attendee has a
`Guardian` with the same normalized email as the one just entered. If any
exist, the confirmation page offers:

> You also have 2 other students on this trip. Sign for them now?

Each additional child produces its **own** `SignedWaiver` record with its own
signature, timestamp, and audit payload — the app never copies one signature
across participants. The convenience is only that the guardian's details are
pre-filled and they do not have to re-open a second link.

---

## 10. Things that would be unnecessarily complex for V1

Called out and deliberately not built:

1. **Drag-and-drop seat/room boards.** Tap-to-assign with a bottom sheet is
   faster on a phone and dramatically simpler. Auto-assign covers the bulk case.
2. **A permissions matrix.** Three coarse roles, one access rule.
3. **Real-time collaboration / websockets.** Server actions + revalidation is
   sufficient; two leaders editing the same room list is rare and last-write-wins
   is acceptable here.
4. **Server-side PDF generation.** Print CSS first; the seam is defined.
5. **Offline-first / service worker sync.** Genuinely useful for a campground
   with no signal, but a correctness minefield (conflicting headcounts). V1
   ships a fast, small, server-rendered app instead; offline is a post-V1
   feature with a designed conflict story.
6. **Attendee reuse across trips with a person registry.** Copy-from-previous-trip
   later; per-trip attendees now.
7. **An audit log for every entity.** Waivers get an audit trail because they
   need one. Room assignments do not.
8. **Email as a hard dependency.** Copy-link is the primary path.
9. **SMS.** Recurring cost, explicitly excluded.
10. **A rich-text editor with arbitrary HTML.** The waiver builder uses a
    constrained editor producing a small, sanitized subset (paragraphs, bold,
    italic, lists). Arbitrary HTML in a legal document that gets snapshotted and
    reprinted is an XSS and integrity risk with no product upside.

---

## 11. Development phases

| Phase | Contents | Definition of done |
| --- | --- | --- |
| **0. Foundation** | Next.js + Tailwind + brand tokens, Prisma schema, migrations, seed | `prisma migrate` runs; brand system renders |
| **1. Identity** | Signup, login, sessions, org creation, org switcher, access guards | A user can create an account and an organization |
| **2. Trips & People** | Trip CRUD, roster, attendee detail, quick-add, guardians | 40+ attendees can be entered quickly on mobile and desktop |
| **3. Waivers** | Template library, versioning, trip requirement, recipients, link generation, public signing, signed records, waiver dashboard | A parent signs from a phone with no account; the record is immutable |
| **4. Money & paper** | Payments, document requirements, status matrix | Outstanding balances and missing forms are visible |
| **5. Logistics** | Vehicles + auto-assign, rooms + auto-assign, itinerary, leader assignments | Every attendee has a seat and a bed |
| **6. Readiness & Prayer** | Readiness engine, dashboard cards, issue list, tasks, prayer focuses, READY. SET. AMEN. state | The dashboard tells the truth about the trip |
| **7. On the road** | Headcount mode, emergency information | A leader counts 48 students beside a van in under a minute |
| **8. Paper out** | Trip packet builder, individual print reports | Everything prints cleanly and saves to PDF from a phone |
| **9. Hardening** | Rate limits, security review, delete-my-data flow, accessibility pass, docs | Ship |

---

## 12. Non-goals restated

No native apps. No AI. No SMS. No chat. No social graph. No church membership
database. No giving. No parent accounts. No payment processing. No arbitrary
PDF editing. No AI-generated legal language, ever.
