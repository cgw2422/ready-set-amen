/**
 * Platform admin: the metrics, the demo exclusion, and the data boundary.
 *
 * Built against a real database on an isolated schema, because every number
 * here is a question about what is actually in the tables — "is the demo
 * church excluded?" cannot be answered by a mock.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:admin
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/crypto";
import { allTimeMetrics, recentActivity, windowMetrics } from "../src/lib/admin/metrics";
import {
  accountDetail,
  listAccounts,
  listOrganizations,
  listPurchases,
  organizationDetail,
} from "../src/lib/admin/directory";

const TAG = "admin-metrics-test";
const email = (name: string) => `${name}@${TAG}.test`;

let realOrgId = "";
let paidOrgId = "";
let manualOrgId = "";
let demoOrgId = "";
let paidOwnerId = "";

/** Everything this suite creates, so it can clean up exactly what it made. */
const created = { orgs: [] as string[], users: [] as string[] };

async function makeUser(name: string, extra: { isSystem?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      email: email(name),
      firstName: name,
      lastName: "Test",
      passwordHash: await hashPassword("a strong test password"),
      isSystem: extra.isSystem ?? false,
    },
    select: { id: true },
  });
  created.users.push(user.id);
  return user.id;
}

async function makeOrg(options: {
  name: string;
  ownerId: string;
  entitlement?: "FREE_SETUP" | "LIFETIME" | "MANUAL_LIFETIME" | "DEMO";
  isDemo?: boolean;
  trips?: number;
  attendeesPerTrip?: number;
  createdAt?: Date;
}) {
  const org = await prisma.organization.create({
    data: {
      name: options.name,
      slug: `${TAG}-${options.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      entitlement: options.entitlement ?? "FREE_SETUP",
      isDemo: options.isDemo ?? false,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      members: { create: { userId: options.ownerId, role: "OWNER" } },
      trips: {
        create: Array.from({ length: options.trips ?? 0 }, (_, i) => ({
          name: `${options.name} Trip ${i + 1}`,
          ...(options.createdAt ? { createdAt: options.createdAt } : {}),
        })),
      },
    },
    select: { id: true, trips: { select: { id: true } } },
  });
  created.orgs.push(org.id);

  for (const trip of org.trips) {
    for (let i = 0; i < (options.attendeesPerTrip ?? 0); i += 1) {
      await prisma.attendee.create({
        data: { tripId: trip.id, firstName: `Person${i}`, lastName: options.name },
      });
    }
  }
  return org.id;
}

async function cleanup() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${TAG}.test` } } });
}

/**
 * The suite measures deltas rather than absolutes: the database it runs against
 * also carries other suites' fixtures, and asserting "exactly 4 organizations"
 * would only be true in an empty world.
 */
let baseline: Awaited<ReturnType<typeof allTimeMetrics>>;

before(async () => {
  await cleanup();
  baseline = await allTimeMetrics();

  // Two real churches: one still free, one that paid through Stripe.
  const freeOwner = await makeUser("freeowner");
  realOrgId = await makeOrg({ name: "Free Church", ownerId: freeOwner, trips: 1, attendeesPerTrip: 3 });

  paidOwnerId = await makeUser("paidowner");
  paidOrgId = await makeOrg({
    name: "Paid Church",
    ownerId: paidOwnerId,
    entitlement: "LIFETIME",
    trips: 2,
    attendeesPerTrip: 4,
  });

  const manualOwner = await makeUser("manualowner");
  manualOrgId = await makeOrg({
    name: "Pilot Church",
    ownerId: manualOwner,
    entitlement: "MANUAL_LIFETIME",
    trips: 1,
    attendeesPerTrip: 2,
  });

  // A demo church with a demo-only owner — the shape the real showcase has.
  const demoOwner = await makeUser("demoowner", { isSystem: true });
  demoOrgId = await makeOrg({
    name: "Demo Church",
    ownerId: demoOwner,
    entitlement: "DEMO",
    isDemo: true,
    trips: 3,
    attendeesPerTrip: 10,
  });

  // Someone who belongs to a real church *and* was shown the demo. They are a
  // genuine user and must still be counted.
  const bothUser = await makeUser("bothorgs");
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: realOrgId, userId: bothUser, role: "LEADER" },
      { organizationId: demoOrgId, userId: bothUser, role: "LEADER" },
    ],
  });

  // A brand-new signup with no church yet: still a real account.
  await makeUser("nochurch");

  // Purchases: two real Stripe sales at different prices, one manual grant,
  // and one against the demo church that must never count.
  await prisma.purchase.createMany({
    data: [
      {
        organizationId: paidOrgId,
        source: "STRIPE_CHECKOUT",
        entitlement: "LIFETIME",
        amountCents: 1499,
        currency: "usd",
        stripeCheckoutSessionId: `cs_${TAG}_1`,
        stripePaymentIntentId: `pi_${TAG}_1`,
      },
      {
        organizationId: realOrgId,
        source: "STRIPE_CHECKOUT",
        entitlement: "LIFETIME",
        amountCents: 3900,
        currency: "usd",
        stripeCheckoutSessionId: `cs_${TAG}_2`,
      },
      {
        organizationId: manualOrgId,
        source: "MANUAL_GRANT",
        entitlement: "MANUAL_LIFETIME",
        amountCents: 0,
        grantReason: "pilot church",
      },
      {
        organizationId: demoOrgId,
        source: "STRIPE_CHECKOUT",
        entitlement: "LIFETIME",
        amountCents: 9999,
        currency: "usd",
        stripeCheckoutSessionId: `cs_${TAG}_demo`,
      },
    ],
  });

  // realOrgId now has a Stripe purchase, so it converted.
  await prisma.organization.update({ where: { id: realOrgId }, data: { entitlement: "LIFETIME" } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// All-time metrics
// ---------------------------------------------------------------------------

test("accounts created counts real people and skips demo-only accounts", async () => {
  const now = await allTimeMetrics();
  // freeowner, paidowner, manualowner, bothorgs, nochurch — five real people.
  // demoowner is a system account belonging only to the demo church.
  assert.equal(now.accountsCreated - baseline.accountsCreated, 5);
});

test("a user in both a real church and the demo still counts", async () => {
  const accounts = await listAccounts(email("bothorgs"));
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].organizations.length, 2);
  assert.ok(accounts[0].organizations.some((o) => o.isDemo));
  assert.ok(accounts[0].organizations.some((o) => !o.isDemo));
  // Counted above; this asserts the reason rather than the number.
});

test("organizations created counts real churches and excludes the demo", async () => {
  const now = await allTimeMetrics();
  assert.equal(now.organizationsCreated - baseline.organizationsCreated, 3);
  assert.equal(now.demoOrganizations - baseline.demoOrganizations, 1);
});

test("a FREE_SETUP church counts as an organization created", async () => {
  const owner = await makeUser("stillfree");
  await makeOrg({ name: "Still Free", ownerId: owner, entitlement: "FREE_SETUP" });
  const now = await allTimeMetrics();
  assert.equal(now.organizationsCreated - baseline.organizationsCreated, 4);
});

test("trips started counts every real trip, including a free church's first", async () => {
  const now = await allTimeMetrics();
  // 1 free + 2 paid + 1 manual. The demo's 3 are excluded.
  assert.equal(now.tripsStarted - baseline.tripsStarted, 4);
});

test("attendees and signed waivers exclude the demo church", async () => {
  const now = await allTimeMetrics();
  // 3 + 8 + 2 real. The demo's 30 are excluded.
  assert.equal(now.totalAttendees - baseline.totalAttendees, 13);

  const attendee = await prisma.attendee.findFirstOrThrow({
    where: { trip: { organizationId: demoOrgId } },
    select: { id: true },
  });
  const before = (await allTimeMetrics()).signedWaivers;
  await signWaiverFor(attendee.id, demoOrgId);
  assert.equal((await allTimeMetrics()).signedWaivers, before, "a demo signature is not counted");
});

test("entitlement counts are reported separately and correctly", async () => {
  const now = await allTimeMetrics();
  assert.equal(now.manualLifetimeOrganizations - baseline.manualLifetimeOrganizations, 1);
  // Free Church converted to LIFETIME; Still Free is the remaining free one.
  assert.equal(now.freeSetupOrganizations - baseline.freeSetupOrganizations, 1);
});

// ---------------------------------------------------------------------------
// Revenue and conversion
// ---------------------------------------------------------------------------

test("revenue sums what was actually charged, across differing prices", async () => {
  const now = await allTimeMetrics();
  // $14.99 + $39.00. Never a count times a price.
  assert.equal(now.lifetimeRevenueCents - baseline.lifetimeRevenueCents, 1499 + 3900);
  assert.equal(now.lifetimePurchases - baseline.lifetimePurchases, 2);
});

test("a manual grant is never revenue and never a conversion", async () => {
  const purchases = await listPurchases();
  const grant = purchases.find((p) => p.grantReason === "pilot church");
  assert.ok(grant);
  assert.equal(grant!.source, "MANUAL_GRANT");
  assert.equal(grant!.amountCents, 0);
  assert.equal(grant!.checkoutSessionId, null, "no Stripe reference is invented for a grant");

  const now = await allTimeMetrics();
  // The manual church is not among the paying ones.
  const paying = await prisma.organization.findMany({
    where: { purchases: { some: { source: "STRIPE_CHECKOUT" } }, isDemo: false },
    select: { id: true },
  });
  assert.ok(!paying.some((o) => o.id === manualOrgId));
  assert.equal(now.paidOrganizations - baseline.paidOrganizations, 2);
});

test("a demo church's Stripe row is excluded from revenue and conversion", async () => {
  const now = await allTimeMetrics();
  // The $99.99 demo purchase is present in the table but absent from revenue.
  assert.equal(now.lifetimeRevenueCents - baseline.lifetimeRevenueCents, 1499 + 3900);
  const demoRow = (await listPurchases()).find((p) => p.organizationId === demoOrgId);
  assert.ok(demoRow, "it is still visible on the purchases page");
  assert.equal(demoRow!.isDemo, true, "and clearly marked as demo");
});

test("conversion rate is paying real organizations over real organizations", async () => {
  const now = await allTimeMetrics();
  assert.equal(
    now.conversionRate,
    now.organizationsCreated > 0 ? now.paidOrganizations / now.organizationsCreated : null,
  );
  assert.ok(now.conversionRate !== null && now.conversionRate > 0 && now.conversionRate <= 1);
});

test("an unfinished checkout is not revenue, because no purchase row exists", async () => {
  const before = await allTimeMetrics();
  // A cancelled or failed checkout never reaches grantLifetimeAccess, so there
  // is nothing to record. Asserting the absence is the whole point.
  const rows = await prisma.purchase.count({
    where: { organizationId: realOrgId, source: "STRIPE_CHECKOUT" },
  });
  assert.equal(rows, 1, "one completed purchase, not one per attempt");
  assert.equal((await allTimeMetrics()).lifetimeRevenueCents, before.lifetimeRevenueCents);
});

// ---------------------------------------------------------------------------
// Time windows
// ---------------------------------------------------------------------------

test("time windows count only what falls inside them", async () => {
  const owner = await makeUser("oldsignup");
  const longAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  await prisma.user.update({ where: { id: owner }, data: { createdAt: longAgo } });
  await makeOrg({ name: "Old Church", ownerId: owner, trips: 1, createdAt: longAgo });

  const day = await windowMetrics("day", 1);
  const week = await windowMetrics("week", 7);
  const month = await windowMetrics("month", 30);

  // The 45-day-old church is outside every window.
  assert.ok(month.organizationsCreated >= week.organizationsCreated);
  assert.ok(week.organizationsCreated >= day.organizationsCreated);

  const all = await allTimeMetrics();
  assert.ok(
    all.organizationsCreated > month.organizationsCreated,
    "all time includes the old church that the 30-day window does not",
  );
});

test("a window never counts demo activity", async () => {
  const week = await windowMetrics("week", 7);
  const demoTrips = await prisma.trip.count({ where: { organizationId: demoOrgId } });
  assert.ok(demoTrips > 0);
  const realTripsThisWeek = await prisma.trip.count({
    where: {
      organization: { isDemo: false },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  assert.equal(week.tripsStarted, realTripsThisWeek);
});

// ---------------------------------------------------------------------------
// The data boundary
// ---------------------------------------------------------------------------

/** Fields that must never appear in anything the admin pages render. */
const FORBIDDEN = [
  "passwordHash",
  "tokenHash",
  "tokenPrefix",
  "medicalConditions",
  "medications",
  "allergies",
  "dietaryRestrictions",
  "emergencyContactName",
  "emergencyContactPhone",
  "insuranceProvider",
  "insurancePolicyNumber",
  "doctorName",
  "doctorPhone",
  "typedSignature",
  "drawnSignature",
  "documentSnapshot",
  "signerEmail",
];

function assertNoSensitiveFields(payload: unknown, label: string) {
  const json = JSON.stringify(payload);
  for (const field of FORBIDDEN) {
    assert.ok(!json.includes(field), `${label} must not contain ${field}`);
  }
}

test("the organizations listing carries counts, never church data", async () => {
  const rows = await listOrganizations({ search: TAG });
  assert.ok(rows.length > 0);
  assertNoSensitiveFields(rows, "listOrganizations");
});

test("an organization overview carries counts, never church data", async () => {
  const detail = await organizationDetail(paidOrgId);
  assert.ok(detail);
  assert.equal(detail!.trips, 2);
  assert.equal(detail!.attendees, 8);
  assertNoSensitiveFields(detail, "organizationDetail");
});

test("the accounts listing never carries a hash or a token", async () => {
  const rows = await listAccounts(TAG);
  assert.ok(rows.length > 0);
  assertNoSensitiveFields(rows, "listAccounts");
  assertNoSensitiveFields(await accountDetail(paidOwnerId), "accountDetail");
});

test("purchases carry Stripe references but never a secret", async () => {
  const rows = await listPurchases();
  assertNoSensitiveFields(rows, "listPurchases");
  const json = JSON.stringify(rows);
  assert.ok(!json.includes("sk_"), "no secret key");
  assert.ok(!json.includes("whsec_"), "no webhook secret");
  const stripeRow = rows.find((r) => r.checkoutSessionId === `cs_${TAG}_1`);
  assert.equal(stripeRow?.paymentIntentId, `pi_${TAG}_1`, "safe identifiers are kept for support");
});

test("recent activity names churches and people, never attendees or their data", async () => {
  const entries = await recentActivity(30);
  assertNoSensitiveFields(entries, "recentActivity");

  // The demo church's activity must not appear in the feed at all.
  assert.ok(!entries.some((e) => e.subject === "Demo Church"));
  assert.ok(entries.some((e) => e.kind === "organization"));
});

test("no attendee name reaches the admin surface", async () => {
  const attendee = await prisma.attendee.findFirstOrThrow({
    where: { trip: { organizationId: paidOrgId } },
    select: { firstName: true, lastName: true },
  });
  const surface = JSON.stringify([
    await listOrganizations({ search: TAG }),
    await organizationDetail(paidOrgId),
    await recentActivity(30),
  ]);
  assert.ok(
    !surface.includes(`${attendee.firstName}`),
    "an attendee's name is never part of an admin response",
  );
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Creates a signed waiver the shortest legitimate way, for counting only. */
async function signWaiverFor(attendeeId: string, organizationId: string) {
  const template = await prisma.waiverTemplate.create({
    data: {
      organizationId,
      name: `${TAG} template`,
      versions: {
        create: { versionNumber: 1, content: { formatVersion: 1 }, contentHash: "x".repeat(64) },
      },
    },
    include: { versions: true },
  });
  const trip = await prisma.attendee.findUniqueOrThrow({
    where: { id: attendeeId },
    select: { tripId: true },
  });
  const requirement = await prisma.tripWaiverRequirement.create({
    data: { tripId: trip.tripId, versionId: template.versions[0].id, title: "T", appliesToAll: true },
  });
  const recipient = await prisma.waiverRecipient.create({
    data: { requirementId: requirement.id, attendeeId, signerRole: "SELF", status: "SIGNED" },
  });
  await prisma.signedWaiver.create({
    data: {
      recipientId: recipient.id,
      attendeeId,
      versionId: template.versions[0].id,
      signerName: "Test Signer",
      signerRole: "SELF",
      signerRelationship: "Self",
      participantNameAtSigning: "Test Participant",
      typedSignature: "Test Signer",
      documentSnapshot: { formatVersion: 1 },
      documentHash: "y".repeat(64),
      consentToElectronicRecords: true,
      consentText: "Test consent",
      acknowledgements: [],
    },
  });
}
