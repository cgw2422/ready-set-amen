/**
 * Demo organization safety.
 *
 * The showcase is ordinary application data, and these prove it stays that way:
 * it cannot be discovered by a stranger, it cannot leak into another church,
 * the reset cannot touch anything that is not marked as demo, and the demo's
 * waivers were signed through the same code path a real parent uses.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:demo
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/db";
import { hashPassword, hashDocument, sha256 } from "../src/lib/crypto";
import {
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_OWNER_EMAIL,
  DEMO_TRIP_NAME_PREFIX,
  DEMO_WAIVER_NOTICE,
} from "../src/lib/demo/constants";
import {
  deleteDemoOrganization,
  findDemoOrganization,
  resetDemoOrganization,
  seedDemoOrganization,
  setDemoPassword,
} from "../src/lib/demo/seed";
import { resolveSigningToken } from "../src/lib/waiver-service";
import { loadTripReadiness } from "../src/lib/trip-data";

const OUTSIDER_EMAIL = "stranger@demo-test.local";
const REAL_CHURCH_SLUG = "a-real-church-demo-test";

let outsiderId = "";
let realOrgId = "";
let realTripId = "";
let realAttendeeId = "";

before(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [DEMO_ORG_SLUG, REAL_CHURCH_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OUTSIDER_EMAIL, DEMO_OWNER_EMAIL] } } });

  const outsider = await prisma.user.create({
    data: {
      email: OUTSIDER_EMAIL,
      firstName: "Stranger",
      lastName: "Test",
      passwordHash: await hashPassword("outsider password"),
    },
  });
  outsiderId = outsider.id;

  // A real church that must survive every demo operation untouched.
  const realOrg = await prisma.organization.create({
    data: {
      name: "A Real Church",
      slug: REAL_CHURCH_SLUG,
      members: { create: { userId: outsider.id, role: "OWNER" } },
      trips: {
        create: {
          name: "A Real Trip",
          attendees: { create: { firstName: "Real", lastName: "Student", isMinor: true } },
        },
      },
    },
    include: { trips: { include: { attendees: true } } },
  });
  realOrgId = realOrg.id;
  realTripId = realOrg.trips[0].id;
  realAttendeeId = realOrg.trips[0].attendees[0].id;

  await seedDemoOrganization({ password: "demo test password" });
});

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [DEMO_ORG_SLUG, REAL_CHURCH_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OUTSIDER_EMAIL, DEMO_OWNER_EMAIL] } } });
  await prisma.$disconnect();
});

async function demoOrg() {
  const org = await findDemoOrganization();
  assert.ok(org, "the demo organization should exist");
  return org!;
}

// ---------------------------------------------------------------------------
// It is a normal organization
// ---------------------------------------------------------------------------

test("the demo is a real organization row, flagged only for tooling", async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG } });
  assert.equal(org.name, DEMO_ORG_NAME);
  assert.equal(org.isDemo, true);
  // It went through the same waiver acknowledgement a real church does.
  assert.notEqual(org.waiverTermsAcceptedAt, null);
});

test("the demo seeds the promised content", async () => {
  const org = await demoOrg();
  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });

  const counts = {
    attendees: await prisma.attendee.count({ where: { tripId: trip.id } }),
    minors: await prisma.attendee.count({ where: { tripId: trip.id, isMinor: true } }),
    leaders: await prisma.attendee.count({ where: { tripId: trip.id, isLeader: true } }),
    vehicles: await prisma.vehicle.count({ where: { tripId: trip.id } }),
    rooms: await prisma.room.count({ where: { tripId: trip.id } }),
    signed: await prisma.signedWaiver.count({ where: { attendee: { tripId: trip.id } } }),
    unsigned: await prisma.waiverRecipient.count({
      where: { requirement: { tripId: trip.id }, status: { not: "SIGNED" } },
    }),
    headcounts: await prisma.headcountSession.count({ where: { tripId: trip.id } }),
    itinerary: await prisma.itineraryItem.count({ where: { tripId: trip.id } }),
  };

  assert.equal(counts.attendees, 50);
  assert.equal(counts.leaders, 8);
  assert.equal(counts.minors, 42);
  assert.equal(counts.vehicles, 7);
  assert.equal(counts.rooms, 13);
  assert.equal(counts.signed, 46);
  assert.equal(counts.unsigned, 4);
  assert.ok(counts.headcounts >= 3, "headcount history exists");
  assert.ok(counts.itinerary >= 20, "several days of schedule");

  // Sibling groups and guardians responsible for more than one child.
  const sharedGuardians = await prisma.guardian.groupBy({
    by: ["emailNormalized"],
    where: { attendee: { tripId: trip.id } },
    _count: { _all: true },
    having: { emailNormalized: { _count: { gt: 1 } } },
  });
  assert.ok(sharedGuardians.length >= 5, `expected sibling groups, saw ${sharedGuardians.length}`);
});

test("the demo trip is always still ahead, however long the demo has existed", async () => {
  const org = await demoOrg();
  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });
  assert.ok(trip.startDate && trip.endDate, "the demo trip is dated");
  const startDate = trip.startDate!;

  // A permanent demo pinned to a fixed date eventually shows a trip that already
  // happened, which turns the whole dashboard into history instead of work.
  assert.ok(startDate.getTime() > Date.now(), "the trip must start in the future");
  assert.ok(trip.endDate!.getTime() > startDate.getTime());
  assert.equal(trip.name, `${DEMO_TRIP_NAME_PREFIX} ${startDate.getUTCFullYear()}`);
  assert.ok(trip.depositDueDate && trip.depositDueDate.getTime() < startDate.getTime());
  assert.ok(
    trip.finalPaymentDueDate && trip.finalPaymentDueDate.getTime() < startDate.getTime(),
  );

  const firstDay = await prisma.itineraryItem.findFirstOrThrow({
    where: { tripId: trip.id },
    orderBy: { date: "asc" },
  });
  assert.ok(firstDay.date.getTime() >= startDate.getTime());
});

test("the starting state is 'almost ready' with a real punch list", async () => {
  const org = await demoOrg();
  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });
  const { readiness } = await loadTripReadiness(trip.id);

  assert.ok(
    readiness.percent >= 85 && readiness.percent <= 92,
    `expected 85-92% readiness, got ${readiness.percent}%`,
  );
  assert.equal(readiness.prayerComplete, false, "Pray Over The Group is deliberately not done");
  assert.equal(readiness.logisticsComplete, false);

  const headlines = readiness.issues.map((i) => i.headline);
  assert.ok(headlines.includes("4 waivers unsigned"), headlines.join(" | "));
  assert.ok(headlines.includes("2 missing emergency contacts"), headlines.join(" | "));
  assert.ok(headlines.includes("1 without a vehicle"));
  assert.ok(headlines.includes("2 without a room"));
  assert.ok(headlines.includes("2 tasks open"));

  // Signing a waiver copies an emergency contact onto the attendee, so the two
  // people the punch list names must be two of the people still unsigned —
  // otherwise seeding quietly resolves its own outstanding item.
  const withoutContact = await prisma.attendee.findMany({
    where: { tripId: trip.id, emergencyContactName: null },
    select: { id: true },
  });
  assert.equal(withoutContact.length, 2);
  for (const attendee of withoutContact) {
    const recipient = await prisma.waiverRecipient.findFirstOrThrow({
      where: { attendeeId: attendee.id },
    });
    assert.notEqual(recipient.status, "SIGNED");
  }

  const money = headlines.find((h) => h.endsWith("outstanding") && h.startsWith("$"));
  assert.ok(money, "an outstanding balance is shown");
  const amount = Number(money!.replace(/[^0-9.]/g, ""));
  assert.ok(amount >= 375 && amount <= 600, `outstanding should be $375-$600, got ${money}`);
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

test("a real user cannot discover or open the demo", async () => {
  const org = await demoOrg();

  // Exactly the query the access layer builds for /orgs/:slug.
  const reachable = await prisma.organization.findFirst({
    where: { slug: DEMO_ORG_SLUG, members: { some: { userId: outsiderId } } },
  });
  assert.equal(reachable, null, "a stranger must not resolve the demo organization");

  const visible = await prisma.organization.findMany({
    where: { members: { some: { userId: outsiderId } } },
    select: { slug: true },
  });
  assert.deepEqual(visible.map((o) => o.slug), [REAL_CHURCH_SLUG], "it is not in their list");

  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });
  const tripReachable = await prisma.trip.findFirst({
    where: { id: trip.id, organization: { members: { some: { userId: outsiderId } } } },
  });
  assert.equal(tripReachable, null, "nor its trip");
});

test("the demo owner cannot see other churches either — isolation runs both ways", async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_OWNER_EMAIL } });
  const reachable = await prisma.trip.findFirst({
    where: { id: realTripId, organization: { members: { some: { userId: owner.id } } } },
  });
  assert.equal(reachable, null);

  const orgs = await prisma.organization.findMany({
    where: { members: { some: { userId: owner.id } } },
    select: { slug: true },
  });
  assert.deepEqual(orgs.map((o) => o.slug), [DEMO_ORG_SLUG]);
});

test("demo data never appears inside another organization's records", async () => {
  const org = await demoOrg();
  const strays = await prisma.attendee.count({
    where: { trip: { organizationId: { not: org.id } }, lastName: "Vandermeer-Castellanos" },
  });
  assert.equal(strays, 0);

  const realChurchAttendees = await prisma.attendee.findMany({
    where: { trip: { organizationId: realOrgId } },
    select: { id: true },
  });
  assert.deepEqual(realChurchAttendees.map((a) => a.id), [realAttendeeId]);
});

// ---------------------------------------------------------------------------
// Waivers use the normal signing path
// ---------------------------------------------------------------------------

test("demo signatures carry the same audit payload as a real signature", async () => {
  const org = await demoOrg();
  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });
  const record = await prisma.signedWaiver.findFirstOrThrow({
    where: { attendee: { tripId: trip.id } },
    include: { responses: true },
  });

  assert.ok(record.signerName.length > 0);
  assert.equal(record.consentToElectronicRecords, true);
  assert.ok(record.consentText.includes("electronic signature"));
  assert.equal(record.documentHash.length, 64);
  assert.equal(hashDocument(record.documentSnapshot), record.documentHash, "snapshot verifies");
  assert.ok(record.ipAddress, "an IP was captured");
  assert.ok(record.userAgent, "a user agent was captured");
  assert.ok(record.responses.length > 0);

  const snapshot = record.documentSnapshot as { content: { sections: Record<string, { body: string }> } };
  assert.ok(
    snapshot.content.sections.intro.body.includes("DEMONSTRATION TEXT ONLY"),
    "the demo waiver is clearly marked as sample wording",
  );
});

test("the demo waiver template is labelled as demonstration wording", async () => {
  const org = await demoOrg();
  const template = await prisma.waiverTemplate.findFirstOrThrow({
    where: { organizationId: org.id },
  });
  assert.match(template.name, /demo/i);
  assert.equal(template.description, DEMO_WAIVER_NOTICE);
});

test("an unsigned demo waiver still enforces normal signing-link security", async () => {
  const org = await demoOrg();
  const trip = await prisma.trip.findFirstOrThrow({ where: { organizationId: org.id } });
  const recipient = await prisma.waiverRecipient.findFirstOrThrow({
    where: { requirement: { tripId: trip.id }, status: { in: ["SENT", "VIEWED"] } },
    include: { signingLinks: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const link = recipient.signingLinks[0];
  assert.ok(link, "an outstanding recipient has a link");
  assert.equal(link.tokenHash.length, 64, "stored hashed, never raw");

  // Guessing does not work here any more than anywhere else.
  for (const guess of ["a".repeat(43), link.tokenHash, ""]) {
    assert.equal(await resolveSigningToken(guess), null);
  }
});

// ---------------------------------------------------------------------------
// Reset safety
// ---------------------------------------------------------------------------

test("reset rebuilds the demo to the same state", async () => {
  const before = await demoOrg();
  const beforeTrip = await prisma.trip.findFirstOrThrow({ where: { organizationId: before.id } });
  const beforeCounts = {
    attendees: await prisma.attendee.count({ where: { tripId: beforeTrip.id } }),
    signed: await prisma.signedWaiver.count({ where: { attendee: { tripId: beforeTrip.id } } }),
    rooms: await prisma.room.count({ where: { tripId: beforeTrip.id } }),
  };

  // Dirty it the way a demonstration would.
  await prisma.attendee.create({
    data: { tripId: beforeTrip.id, firstName: "Added", lastName: "During Demo", isMinor: false },
  });
  await prisma.trip.update({
    where: { id: beforeTrip.id },
    data: { prayerCompletedAt: new Date() },
  });
  assert.equal(await prisma.attendee.count({ where: { tripId: beforeTrip.id } }), beforeCounts.attendees + 1);

  await resetDemoOrganization({ password: "demo test password" });

  const after = await demoOrg();
  const afterTrip = await prisma.trip.findFirstOrThrow({ where: { organizationId: after.id } });
  assert.equal(await prisma.attendee.count({ where: { tripId: afterTrip.id } }), beforeCounts.attendees);
  assert.equal(
    await prisma.signedWaiver.count({ where: { attendee: { tripId: afterTrip.id } } }),
    beforeCounts.signed,
  );
  assert.equal(await prisma.room.count({ where: { tripId: afterTrip.id } }), beforeCounts.rooms);
  assert.equal(afterTrip.prayerCompletedAt, null, "the prayer step is pristine again");
  assert.equal(
    await prisma.attendee.count({ where: { tripId: afterTrip.id, lastName: "During Demo" } }),
    0,
  );
});

test("reset does not touch a real organization", async () => {
  const realBefore = await prisma.organization.findUniqueOrThrow({
    where: { id: realOrgId },
    include: { trips: { include: { attendees: true } } },
  });

  await resetDemoOrganization({ password: "demo test password" });

  const realAfter = await prisma.organization.findUniqueOrThrow({
    where: { id: realOrgId },
    include: { trips: { include: { attendees: true } } },
  });

  assert.equal(realAfter.name, realBefore.name);
  assert.equal(realAfter.trips.length, 1);
  assert.equal(realAfter.trips[0].id, realTripId);
  assert.deepEqual(
    realAfter.trips[0].attendees.map((a) => a.id),
    [realAttendeeId],
    "the real church's student is still there",
  );
});

test("the demo tooling refuses to act if the slug belongs to a real church", async () => {
  await deleteDemoOrganization();

  // Someone registers a church that happens to take the demo slug.
  const impostor = await prisma.organization.create({
    data: {
      name: "Innocent Bystander Church",
      slug: DEMO_ORG_SLUG,
      isDemo: false,
      members: { create: { userId: outsiderId, role: "OWNER" } },
      trips: { create: { name: "Their Real Trip" } },
    },
    include: { trips: true },
  });

  await assert.rejects(
    () => deleteDemoOrganization(),
    /NOT marked as demo data/,
    "delete must refuse",
  );
  await assert.rejects(
    () => resetDemoOrganization({ password: "x".repeat(12) }),
    /NOT marked as demo data/,
    "reset must refuse",
  );

  const survived = await prisma.organization.findUnique({ where: { id: impostor.id } });
  assert.notEqual(survived, null, "the innocent organization is untouched");
  assert.equal(await prisma.trip.count({ where: { organizationId: impostor.id } }), 1);

  await prisma.organization.delete({ where: { id: impostor.id } });
  await seedDemoOrganization({ password: "demo test password" });
});

test("seeding twice is refused rather than duplicating the demo", async () => {
  await assert.rejects(
    () => seedDemoOrganization({ password: "demo test password" }),
    /already exists/,
  );
  assert.equal(await prisma.organization.count({ where: { slug: DEMO_ORG_SLUG } }), 1);
});

test("setting the demo password signs the demo account out everywhere", async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_OWNER_EMAIL } });
  await prisma.session.create({
    data: {
      userId: owner.id,
      tokenHash: sha256(`demo-session-${Date.now()}`),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  assert.equal(await prisma.session.count({ where: { userId: owner.id } }), 1);

  await setDemoPassword("a different demo password");
  assert.equal(await prisma.session.count({ where: { userId: owner.id } }), 0);
});

test("no demo password is committed to the repository", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["src/lib/demo/seed.ts", "src/lib/demo/constants.ts", "scripts/demo.ts"]) {
    const source = readFileSync(file, "utf8").replace(/DEMO_PASSWORD/g, "");
    // A literal is only a secret if it is fixed. `demo-${generateToken(9)}` is a
    // freshly generated value, so interpolated template strings do not count.
    const literals = source.match(/password\s*[:=]\s*(?:"[^"]{6,}"|'[^']{6,}'|`[^`]{6,}`)/gi) ?? [];
    const hardcoded = literals.filter((match) => !match.includes("${"));
    assert.deepEqual(hardcoded, [], `${file} must not contain a literal password`);
  }
});
