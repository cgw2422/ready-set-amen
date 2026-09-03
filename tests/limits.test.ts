/**
 * The free limits under concurrency.
 *
 * A count followed by a write is a race: two requests arriving together can
 * both read "nine people" and each add one. These fire the real server paths
 * simultaneously against a real database, because that is the only way to prove
 * the lock holds — a sequential test passes either way.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:limits
 */
import { strict as assert } from "node:assert";
import { after, before, beforeEach, test } from "node:test";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/crypto";
import {
  createUnderAttendeeCapacity,
  createUnderTripCapacity,
} from "../src/lib/capacity";
import { FREE_SETUP } from "../src/lib/entitlement";
import type { Entitlement } from "@prisma/client";

const OWNER_EMAIL = "owner@limits.test";
const SLUG = "limits-test-church";

let userId = "";
let orgId = "";
let tripId = "";

/** The organization a server action would have after resolving membership. */
function context(entitlement: Entitlement) {
  return { id: orgId, entitlement };
}

before(async () => {
  await prisma.organization.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
  const user = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      firstName: "Owner",
      lastName: "Limits",
      passwordHash: await hashPassword("a strong test password"),
    },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.organization.deleteMany({ where: { slug: SLUG } });
  const org = await prisma.organization.create({
    data: {
      name: "Limits Test",
      slug: SLUG,
      members: { create: { userId, role: "OWNER" } },
      trips: { create: { name: "First Trip" } },
    },
    include: { trips: { select: { id: true } } },
  });
  orgId = org.id;
  tripId = org.trips[0].id;
});

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
  await prisma.$disconnect();
});

type Org = ReturnType<typeof context>;

/** The capacity layer answers with a decision; a refusal is `ok: false`. */
async function attempt<T>(work: () => Promise<{ ok: boolean; value?: T }>) {
  return work();
}

function addPerson(org: Org, name: string, adding = 1) {
  return createUnderAttendeeCapacity(org, adding, (tx) =>
    tx.attendee.create({
      data: { tripId, firstName: name, lastName: "Test" },
      select: { id: true },
    }),
  );
}

// ---------------------------------------------------------------------------
// Attendees
// ---------------------------------------------------------------------------

test("ten people can be added one at a time, and the eleventh cannot", async () => {
  const ctx = context("FREE_SETUP");
  for (let i = 1; i <= FREE_SETUP.attendees; i += 1) {
    const result = await attempt(() => addPerson(ctx, `Person${i}`));
    assert.equal(result.ok, true, `person ${i} should be allowed`);
  }
  assert.equal((await attempt(() => addPerson(ctx, "Eleventh"))).ok, false);
  assert.equal(await prisma.attendee.count({ where: { tripId } }), FREE_SETUP.attendees);
});

test("the blocked eleventh person leaves the first ten untouched", async () => {
  const ctx = context("FREE_SETUP");
  for (let i = 1; i <= FREE_SETUP.attendees; i += 1) await addPerson(ctx, `Person${i}`);
  await attempt(() => addPerson(ctx, "Eleventh"));

  const names = await prisma.attendee.findMany({ where: { tripId }, select: { firstName: true } });
  assert.equal(names.length, 10);
  assert.ok(!names.some((n) => n.firstName === "Eleventh"), "nothing half-created");
});

test("a batch that would exceed the limit writes nothing at all", async () => {
  const ctx = context("FREE_SETUP");
  for (let i = 1; i <= 8; i += 1) await addPerson(ctx, `Person${i}`);

  const result = await attempt(() =>
    createUnderAttendeeCapacity(
      ctx,
      5,
      async (tx) => {
        for (let i = 0; i < 5; i += 1) {
          await tx.attendee.create({ data: { tripId, firstName: `Batch${i}`, lastName: "Test" } });
        }
      },
    ),
  );

  assert.equal(result.ok, false, "five when two remain is refused");
  assert.equal(
    await prisma.attendee.count({ where: { tripId } }),
    8,
    "refused before anything was written, not half-applied",
  );
});

test("a batch that exactly fills the remaining spots is allowed", async () => {
  const ctx = context("FREE_SETUP");
  for (let i = 1; i <= 6; i += 1) await addPerson(ctx, `Person${i}`);

  const result = await attempt(() =>
    createUnderAttendeeCapacity(
      ctx,
      4,
      async (tx) => {
        for (let i = 0; i < 4; i += 1) {
          await tx.attendee.create({ data: { tripId, firstName: `Batch${i}`, lastName: "Test" } });
        }
      },
    ),
  );
  assert.equal(result.ok, true);
  assert.equal(await prisma.attendee.count({ where: { tripId } }), 10);
});

test("twenty simultaneous requests cannot push a free church past ten", async () => {
  const ctx = context("FREE_SETUP");
  const attempts = Array.from({ length: 20 }, (_, i) => attempt(() => addPerson(ctx, `Race${i}`)));
  const results = await Promise.all(attempts);

  const allowed = results.filter((r) => r.ok).length;
  const total = await prisma.attendee.count({ where: { tripId } });

  assert.equal(total, FREE_SETUP.attendees, `expected exactly 10 people, found ${total}`);
  assert.equal(allowed, FREE_SETUP.attendees, "exactly ten requests succeeded");
});

test("two simultaneous batches cannot between them exceed the limit", async () => {
  const ctx = context("FREE_SETUP");
  const batch = () =>
    attempt(() =>
      createUnderAttendeeCapacity(
        ctx,
        6,
        async (tx) => {
          for (let i = 0; i < 6; i += 1) {
            await tx.attendee.create({
              data: { tripId, firstName: `B${Math.random()}`, lastName: "Test" },
            });
          }
        },
      ),
    );

  const [a, b] = await Promise.all([batch(), batch()]);
  const total = await prisma.attendee.count({ where: { tripId } });

  assert.ok(total <= FREE_SETUP.attendees, `expected at most 10, found ${total}`);
  assert.equal([a, b].filter((r) => r.ok).length, 1, "one batch of six fits, the second does not");
});

test("a paid church has no attendee ceiling", async () => {
  const ctx = context("LIFETIME");
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, i) => attempt(() => addPerson(ctx, `Paid${i}`))),
  );
  assert.equal(results.filter((r) => r.ok).length, 25);
  assert.equal(await prisma.attendee.count({ where: { tripId } }), 25);
});

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

function addTrip(org: Org, name: string) {
  return createUnderTripCapacity(org, (tx) =>
    tx.trip.create({ data: { organizationId: orgId, name }, select: { id: true } }),
  );
}

test("a second trip is refused, and never created first", async () => {
  const ctx = context("FREE_SETUP");
  const result = await attempt(() => addTrip(ctx, "Second Trip"));
  assert.equal(result.ok, false);
  assert.equal(await prisma.trip.count({ where: { organizationId: orgId } }), 1);
});

test("ten simultaneous requests cannot create a second free trip", async () => {
  const ctx = context("FREE_SETUP");
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => attempt(() => addTrip(ctx, `Race Trip ${i}`))),
  );
  assert.equal(results.filter((r) => r.ok).length, 0, "the organization already has its one trip");
  assert.equal(await prisma.trip.count({ where: { organizationId: orgId } }), 1);
});

test("an organization with no trips gets exactly one, even under a race", async () => {
  await prisma.trip.deleteMany({ where: { organizationId: orgId } });
  const ctx = context("FREE_SETUP");
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => attempt(() => addTrip(ctx, `First ${i}`))),
  );
  assert.equal(results.filter((r) => r.ok).length, 1, "exactly one request wins");
  assert.equal(await prisma.trip.count({ where: { organizationId: orgId } }), 1);
});

test("a paid church can create as many trips as it likes", async () => {
  const ctx = context("MANUAL_LIFETIME");
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => attempt(() => addTrip(ctx, `Trip ${i}`))),
  );
  assert.equal(results.filter((r) => r.ok).length, 5);
});

test("the demo church has no limits either", async () => {
  const ctx = context("DEMO");
  assert.equal((await attempt(() => addTrip(ctx, "Demo Trip"))).ok, true);
  const people = await Promise.all(
    Array.from({ length: 12 }, (_, i) => attempt(() => addPerson(ctx, `Demo${i}`))),
  );
  assert.equal(people.filter((r) => r.ok).length, 12);
});
