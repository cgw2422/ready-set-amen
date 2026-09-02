import { strict as assert } from "node:assert";
import { test } from "node:test";
import { computeReadiness, type ReadinessInput } from "../src/lib/readiness";

function baseInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    config: {},
    attendees: [],
    waivers: { required: 0, signed: 0, notRequired: 0, sent: 0, viewed: 0 },
    forms: { required: 0, complete: 0 },
    vehicles: [],
    rooms: [],
    leaders: [],
    tasks: [],
    prayerCompletedAt: null,
    ...overrides,
  };
}

function person(id: string, overrides: Partial<ReadinessInput["attendees"][number]> = {}) {
  return {
    id,
    name: id,
    isMinor: false,
    isLeader: false,
    hasEmergencyContact: true,
    hasGuardian: true,
    amountDue: 100,
    amountPaid: 100,
    paymentSettled: true,
    vehicleId: "v1",
    roomId: "r1",
    ...overrides,
  };
}

test("an empty trip is 0% and surfaces nothing alarming", () => {
  const result = computeReadiness(baseInput());
  assert.equal(result.percent, 0);
  assert.equal(result.logisticsComplete, false);
  assert.equal(result.issues.length, 0);
});

test("a fully prepared trip reaches 100% before prayer", () => {
  const result = computeReadiness(
    baseInput({
      attendees: [person("a"), person("b")],
      waivers: { required: 2, signed: 2, notRequired: 0, sent: 2, viewed: 2 },
      forms: { required: 2, complete: 2 },
      vehicles: [{ id: "v1", name: "Van 1", capacity: 15, assigned: 2, hasDriver: true }],
      rooms: [
        { id: "r1", name: "Room 201", capacity: 4, assigned: 2, requiresLeader: false, leaderCount: 1 },
      ],
      leaders: [{ role: "Trip Leader", filled: true, required: true }],
      tasks: [{ id: "t1", title: "Snacks", done: true, isPrayerStep: false }],
    }),
  );

  assert.equal(result.percent, 100);
  assert.equal(result.logisticsComplete, true);
  assert.equal(result.prayerComplete, false);
  assert.equal(result.allDone, false);
});

test("prayer is excluded from the score and from the task category", () => {
  const input = baseInput({
    attendees: [person("a")],
    waivers: { required: 1, signed: 1, notRequired: 0, sent: 1, viewed: 1 },
    forms: { required: 1, complete: 1 },
    vehicles: [{ id: "v1", name: "Van 1", capacity: 15, assigned: 1, hasDriver: true }],
    rooms: [
      { id: "r1", name: "Room 201", capacity: 4, assigned: 1, requiresLeader: false, leaderCount: 0 },
    ],
    leaders: [{ role: "Trip Leader", filled: true, required: true }],
    tasks: [
      { id: "t1", title: "Snacks", done: true, isPrayerStep: false },
      { id: "prayer", title: "Pray Over The Group", done: false, isPrayerStep: true },
    ],
  });

  const before = computeReadiness(input);
  assert.equal(before.percent, 100, "an unprayed trip can still be 100% logistically ready");
  assert.equal(before.allDone, false);
  assert.ok(
    before.issues.some((i) => i.category === "prayer"),
    "the prayer invitation appears once the boxes are checked",
  );

  const after = computeReadiness({ ...input, prayerCompletedAt: new Date() });
  assert.equal(after.percent, 100, "completing prayer does not change the percentage");
  assert.equal(after.allDone, true);
  assert.equal(after.issues.filter((i) => i.category === "prayer").length, 0);

  const tasks = after.categories.find((c) => c.key === "tasks");
  assert.equal(tasks?.total, 1, "the prayer step is not counted as a task");
});

test("a category with nothing in it is dropped rather than counted as zero", () => {
  const withoutLodging = computeReadiness(
    baseInput({
      attendees: [person("a", { roomId: null })],
      waivers: { required: 1, signed: 1, notRequired: 0, sent: 1, viewed: 1 },
      forms: { required: 1, complete: 1 },
      vehicles: [{ id: "v1", name: "Van 1", capacity: 15, assigned: 1, hasDriver: true }],
      rooms: [],
      leaders: [{ role: "Trip Leader", filled: true, required: true }],
      tasks: [{ id: "t1", title: "Snacks", done: true, isPrayerStep: false }],
    }),
  );

  assert.equal(withoutLodging.percent, 100, "a day trip with no rooms is not penalised");
  const lodging = withoutLodging.categories.find((c) => c.key === "lodging");
  assert.equal(lodging?.applicable, false);
});

test("problems are reported in friendly, specific language", () => {
  const result = computeReadiness(
    baseInput({
      attendees: [
        person("a", { hasEmergencyContact: false }),
        person("b", { vehicleId: null }),
        person("c", { amountDue: 100, amountPaid: 25, paymentSettled: false }),
      ],
      waivers: { required: 3, signed: 2, notRequired: 0, sent: 3, viewed: 3 },
      vehicles: [{ id: "v1", name: "Church Van 1", capacity: 2, assigned: 3, hasDriver: false }],
      rooms: [
        { id: "r1", name: "Room 201", capacity: 1, assigned: 3, requiresLeader: true, leaderCount: 0 },
      ],
    }),
  );

  const messages = result.issues.map((i) => i.message);
  assert.ok(messages.includes("1 attendee is missing emergency contacts."));
  assert.ok(messages.includes("1 waiver still needs a signature."));
  assert.ok(messages.includes("1 attendee is not assigned to a vehicle."));
  assert.ok(messages.includes("Church Van 1 has 3 riders for 2 seats."));
  assert.ok(messages.includes("Church Van 1 still needs a driver."));
  assert.ok(messages.includes("Room 201 is over capacity — 3 people for 1 spot."));
  assert.ok(messages.includes("Room 201 needs an adult leader."));
  assert.ok(messages.some((m) => m.startsWith("$75") && m.endsWith("remains unpaid.")));
});

test("payments are weighted by money owed, not by head count", () => {
  const result = computeReadiness(
    baseInput({
      attendees: [
        person("a", { amountDue: 1000, amountPaid: 0, paymentSettled: false }),
        person("b", { amountDue: 10, amountPaid: 10 }),
        person("c", { amountDue: 10, amountPaid: 10 }),
      ],
    }),
  );

  const payments = result.categories.find((c) => c.key === "payments");
  // Two of three people are settled, but only $20 of $1,020 is collected.
  assert.ok(payments!.ratio < 0.1, `expected a low ratio, got ${payments!.ratio}`);
});

test("a disabled category is removed from the weighting", () => {
  const result = computeReadiness(
    baseInput({
      config: { payments: { enabled: false } },
      attendees: [person("a", { amountDue: 100, amountPaid: 0, paymentSettled: false })],
      waivers: { required: 1, signed: 1, notRequired: 0, sent: 1, viewed: 1 },
    }),
  );

  assert.equal(result.percent, 100);
  assert.equal(result.categories.find((c) => c.key === "payments")?.enabled, false);
});
