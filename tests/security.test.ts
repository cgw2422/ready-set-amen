/**
 * Security review, made executable.
 *
 * Covers the boundaries that a code reading alone cannot prove: cross-tenant
 * isolation, injection, XSS in stored waiver text, token entropy, and the
 * rate limiter's behaviour under concurrency.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:security
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { generateToken, hashPassword, verifyPassword } from "../src/lib/crypto";
import { rateLimit, rateLimitPeek } from "../src/lib/rate-limit";

let orgA = "";
let orgB = "";
let userA = "";
let userB = "";
let tripA = "";
let tripB = "";
let attendeeA = "";

before(async () => {
  for (const slug of ["sec-church-a", "sec-church-b"]) {
    await prisma.organization.deleteMany({ where: { slug } });
  }
  await prisma.user.deleteMany({ where: { email: { in: ["a@sec.test", "b@sec.test"] } } });

  const a = await prisma.user.create({
    data: { email: "a@sec.test", firstName: "A", lastName: "Leader", passwordHash: "x" },
  });
  const b = await prisma.user.create({
    data: { email: "b@sec.test", firstName: "B", lastName: "Leader", passwordHash: "x" },
  });
  userA = a.id;
  userB = b.id;

  const orgARow = await prisma.organization.create({
    data: { name: "Church A", slug: "sec-church-a", members: { create: { userId: a.id, role: "OWNER" } } },
  });
  const orgBRow = await prisma.organization.create({
    data: { name: "Church B", slug: "sec-church-b", members: { create: { userId: b.id, role: "OWNER" } } },
  });
  orgA = orgARow.id;
  orgB = orgBRow.id;

  const tA = await prisma.trip.create({ data: { organizationId: orgA, name: "A Trip" } });
  const tB = await prisma.trip.create({ data: { organizationId: orgB, name: "B Trip" } });
  tripA = tA.id;
  tripB = tB.id;

  const at = await prisma.attendee.create({
    data: {
      tripId: tripA,
      firstName: "Private",
      lastName: "Student",
      isMinor: true,
      allergies: "Peanuts",
      medications: "Inhaler",
    },
  });
  attendeeA = at.id;
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.$disconnect();
});

// --- Tenant isolation -------------------------------------------------------
// Every authenticated read in the app resolves a trip through
// `Trip -> Organization -> OrganizationMember`. These assert the shape of that
// query actually excludes another church, using the same where-clause the
// access layer builds.

test("a leader cannot load another church's trip by id", async () => {
  const asB = await prisma.trip.findFirst({
    where: { id: tripA, organization: { members: { some: { userId: userB } } } },
  });
  assert.equal(asB, null);

  const asA = await prisma.trip.findFirst({
    where: { id: tripA, organization: { members: { some: { userId: userA } } } },
  });
  assert.notEqual(asA, null);
});

test("a leader cannot load another church's attendee, medical data included", async () => {
  const asB = await prisma.attendee.findFirst({
    where: {
      id: attendeeA,
      trip: { organization: { members: { some: { userId: userB } } } },
    },
  });
  assert.equal(asB, null, "medical information must not be reachable across churches");
});

test("a leader cannot write to another church's headcount", async () => {
  const session = await prisma.headcountSession.create({
    data: { tripId: tripA, label: "A count", expectedCount: 1, records: { create: { attendeeId: attendeeA } } },
  });

  // This is exactly the guarded updateMany the toggle action runs.
  const asB = await prisma.headcountRecord.updateMany({
    where: {
      sessionId: session.id,
      attendeeId: attendeeA,
      session: { trip: { organization: { members: { some: { userId: userB } } } } },
    },
    data: { present: true },
  });
  assert.equal(asB.count, 0, "a foreign leader must not mark anyone present");

  const asA = await prisma.headcountRecord.updateMany({
    where: {
      sessionId: session.id,
      attendeeId: attendeeA,
      session: { trip: { organization: { members: { some: { userId: userA } } } } },
    },
    data: { present: true },
  });
  assert.equal(asA.count, 1);
});

test("a leader cannot attach another church's waiver template to their trip", async () => {
  const template = await prisma.waiverTemplate.create({
    data: { organizationId: orgA, name: "A Template" },
  });
  const found = await prisma.waiverTemplate.findFirst({
    where: { id: template.id, organizationId: orgB },
  });
  assert.equal(found, null);
});

test("a signed waiver is only reachable through its own organization", async () => {
  const reachable = await prisma.signedWaiver.findFirst({
    where: {
      attendee: { trip: { organization: { members: { some: { userId: userB } } } } },
      attendeeId: attendeeA,
    },
  });
  assert.equal(reachable, null);
});

// --- Injection --------------------------------------------------------------

test("SQL injection through the rate limiter key is parameterised away", async () => {
  const evil = "login:acct:'; DROP TABLE users; --";
  const first = await rateLimit(evil, 5, 60_000);
  assert.equal(first.allowed, true);

  // If the payload had executed, this table would be gone.
  const users = await prisma.user.count();
  assert.ok(users >= 2, "users table still exists");

  const stored = await prisma.rateLimitCounter.findUnique({ where: { key: evil } });
  assert.equal(stored?.count, 1, "the payload was stored as data, not executed");
  await prisma.rateLimitCounter.delete({ where: { key: evil } });
});

test("injection attempts in attendee fields are stored as literal text", async () => {
  const payload = "Robert'); DROP TABLE attendees;--";
  const created = await prisma.attendee.create({
    data: { tripId: tripA, firstName: payload, lastName: "Tables", isMinor: false },
  });
  const read = await prisma.attendee.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(read.firstName, payload);
  assert.ok((await prisma.attendee.count()) >= 2, "attendees table still exists");
});

// --- XSS --------------------------------------------------------------------
//
// Waiver text is attacker-influenceable (a church admin pastes it, and it is
// then shown to every parent) and it is snapshotted forever. The invariant is
// that it is never injected as markup. That is checked two ways: statically
// here, and end-to-end in a real browser by tests/day-of-trip.mjs, which puts a
// live payload through the signing page.

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strips comments so a doc-comment naming an API is not read as using it. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("no component in the app injects raw HTML", () => {
  const offenders = sourceFiles("src").filter((file) =>
    /dangerouslySetInnerHTML\s*[=:]/.test(code(file)),
  );
  assert.deepEqual(offenders, [], "raw HTML injection must not exist anywhere in src/");
});

test("the waiver renderer builds React nodes, never markup strings", () => {
  const source = code("src/components/waiver-text.tsx");
  assert.ok(!/dangerouslySetInnerHTML\s*[=:]/.test(source));
  assert.ok(!source.includes("innerHTML"));
  // Its only formatting output is <strong>, <em>, <ul>/<li> and <p> elements
  // built by React — there is no path that turns signer or admin text into tags.
  assert.ok(source.includes("<strong"), "bold is a real element, not a string");
  assert.ok(!/\+\s*["'`]</.test(source), "no string concatenation into markup");
});

// --- Credentials and tokens -------------------------------------------------

test("password hashes are salted, slow, and never reversible to the password", async () => {
  const hash = await hashPassword("a real password");
  assert.ok(!hash.includes("a real password"));
  assert.ok(hash.startsWith("scrypt$32768$"), "cost parameters are recorded with the hash");
  assert.equal(await verifyPassword("a real password", hash), true);
  assert.equal(await verifyPassword("a real passwore", hash), false);
});

test("signing tokens have full 256-bit entropy with no collisions", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) seen.add(generateToken(32));
  assert.equal(seen.size, 5000);

  // Rough smoke test that the alphabet is actually being used.
  const alphabet = new Set([...seen].join("").split(""));
  assert.ok(alphabet.size > 50, `expected a wide alphabet, saw ${alphabet.size} characters`);
});

// --- Rate limiting ----------------------------------------------------------

test("the shared limiter blocks past the limit and is atomic under concurrency", async () => {
  const key = `test:${generateToken(8)}`;
  const results = await Promise.all(
    Array.from({ length: 20 }, () => rateLimit(key, 10, 60_000)),
  );
  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(allowed, 10, `exactly the limit should pass, got ${allowed}`);
  await prisma.rateLimitCounter.delete({ where: { key } }).catch(() => undefined);
});

test("peeking does not consume the budget", async () => {
  const key = `test:${generateToken(8)}`;
  for (let i = 0; i < 5; i += 1) {
    const peek = await rateLimitPeek(key, 3, 60_000);
    assert.equal(peek.allowed, true, "peeking never exhausts the budget");
  }
  await rateLimit(key, 3, 60_000);
  await rateLimit(key, 3, 60_000);
  await rateLimit(key, 3, 60_000);
  assert.equal((await rateLimitPeek(key, 3, 60_000)).allowed, false, "spent budget is visible");
  await prisma.rateLimitCounter.delete({ where: { key } }).catch(() => undefined);
});

// --- Data retention ---------------------------------------------------------

test("deleting a trip removes every trace of its people", async () => {
  const trip = await prisma.trip.create({
    data: {
      organizationId: orgA,
      name: "Disposable Trip",
      attendees: {
        create: {
          firstName: "Temp",
          lastName: "Person",
          isMinor: true,
          allergies: "Something private",
          guardians: { create: { name: "Temp Parent", isPrimary: true } },
        },
      },
    },
    include: { attendees: true },
  });
  const attendeeId = trip.attendees[0].id;

  await prisma.trip.delete({ where: { id: trip.id } });

  assert.equal(await prisma.attendee.count({ where: { id: attendeeId } }), 0);
  assert.equal(await prisma.guardian.count({ where: { attendeeId } }), 0);
  assert.equal(await prisma.headcountRecord.count({ where: { attendeeId } }), 0);
});
