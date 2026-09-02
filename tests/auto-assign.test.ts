import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  autoAssignRooms,
  autoAssignVehicles,
  type AssignPerson,
} from "../src/lib/auto-assign";

function people(specs: [string, Partial<AssignPerson>?][]): AssignPerson[] {
  return specs.map(([name, overrides]) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    isLeader: false,
    gender: null,
    groupKey: null,
    ...overrides,
  }));
}

test("vehicles: nobody is left behind when there are enough seats", () => {
  const roster = people([
    ["Dana Reed", { isLeader: true }],
    ["Marcus Whitfield", { isLeader: true }],
    ...Array.from({ length: 12 }, (_, i): [string, Partial<AssignPerson>?] => [`Student ${i}`]),
  ]);

  const plan = autoAssignVehicles({
    people: roster,
    vehicles: [
      { id: "v1", name: "Van 1", capacity: 8, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
      { id: "v2", name: "Van 2", capacity: 8, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
    ],
    existing: new Map(),
    keepGroupsTogether: false,
    reassignAll: true,
  });

  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.placements.size, roster.length);
});

test("vehicles: capacity and reserved seats are never exceeded", () => {
  const roster = people(Array.from({ length: 10 }, (_, i): [string] => [`Student ${i}`]));

  const plan = autoAssignVehicles({
    people: roster,
    vehicles: [
      { id: "v1", name: "Van 1", capacity: 6, reservedSeats: 2, driverAttendeeId: null, secondaryDriverAttendeeId: null },
      { id: "v2", name: "Van 2", capacity: 6, reservedSeats: 2, driverAttendeeId: null, secondaryDriverAttendeeId: null },
    ],
    existing: new Map(),
    keepGroupsTogether: false,
    reassignAll: true,
  });

  const counts = new Map<string, number>();
  for (const vehicleId of plan.placements.values()) {
    counts.set(vehicleId, (counts.get(vehicleId) ?? 0) + 1);
  }
  assert.ok((counts.get("v1") ?? 0) <= 4);
  assert.ok((counts.get("v2") ?? 0) <= 4);
  assert.equal(plan.unplaced.length, 2, "the two people with no seat are reported, not hidden");
});

test("vehicles: a driver rides in the vehicle they drive", () => {
  const roster = people([["Dana Reed", { isLeader: true }], ["Student A"], ["Student B"]]);

  const plan = autoAssignVehicles({
    people: roster,
    vehicles: [
      { id: "v1", name: "Van 1", capacity: 4, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
      { id: "v2", name: "Van 2", capacity: 4, reservedSeats: 0, driverAttendeeId: "dana-reed", secondaryDriverAttendeeId: null },
    ],
    existing: new Map(),
    keepGroupsTogether: false,
    reassignAll: true,
  });

  assert.equal(plan.placements.get("dana-reed"), "v2");
});

test("vehicles: a family stays together when it fits", () => {
  const roster = people([
    ["Ava Ellis", { groupKey: "ellis" }],
    ["Eli Ellis", { groupKey: "ellis" }],
    ["Ivy Ellis", { groupKey: "ellis" }],
    ["Solo Kim", { groupKey: "kim" }],
  ]);

  const plan = autoAssignVehicles({
    people: roster,
    vehicles: [
      { id: "v1", name: "Van 1", capacity: 3, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
      { id: "v2", name: "Van 2", capacity: 3, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
    ],
    existing: new Map(),
    keepGroupsTogether: true,
    reassignAll: true,
  });

  const ellisVans = new Set(
    ["ava-ellis", "eli-ellis", "ivy-ellis"].map((id) => plan.placements.get(id)),
  );
  assert.equal(ellisVans.size, 1, "the Ellis kids ride together");
});

test("vehicles: running it twice with the same roster gives the same plan", () => {
  const roster = people(Array.from({ length: 9 }, (_, i): [string] => [`Student ${i}`]));
  const vehicles = [
    { id: "v1", name: "Van 1", capacity: 5, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
    { id: "v2", name: "Van 2", capacity: 5, reservedSeats: 0, driverAttendeeId: null, secondaryDriverAttendeeId: null },
  ];
  const args = { people: roster, vehicles, existing: new Map<string, string>(), keepGroupsTogether: true, reassignAll: true };

  const first = autoAssignVehicles(args);
  const second = autoAssignVehicles(args);
  assert.deepEqual([...first.placements.entries()], [...second.placements.entries()]);
});

test("rooms: gender designations are respected", () => {
  const roster = people([
    ["Ava", { gender: "Female" }],
    ["Ivy", { gender: "Female" }],
    ["Eli", { gender: "Male" }],
    ["Owen", { gender: "Male" }],
  ]);

  const plan = autoAssignRooms({
    people: roster,
    rooms: [
      { id: "f1", name: "Room 201", capacity: 4, designation: "FEMALE", requiresLeader: false },
      { id: "m1", name: "Room 301", capacity: 4, designation: "MALE", requiresLeader: false },
    ],
    existing: new Map(),
    separateGenders: true,
    keepGroupsTogether: false,
    keepApart: [],
    reassignAll: true,
  });

  assert.equal(plan.placements.get("ava"), "f1");
  assert.equal(plan.placements.get("ivy"), "f1");
  assert.equal(plan.placements.get("eli"), "m1");
  assert.equal(plan.placements.get("owen"), "m1");
});

test("rooms: a mixed-designation room stays single-gender once occupied", () => {
  const roster = people([
    ["Ava", { gender: "Female" }],
    ["Eli", { gender: "Male" }],
  ]);

  const plan = autoAssignRooms({
    people: roster,
    rooms: [
      { id: "any1", name: "Room 401", capacity: 4, designation: "ANY", requiresLeader: false },
      { id: "any2", name: "Room 402", capacity: 4, designation: "ANY", requiresLeader: false },
    ],
    existing: new Map(),
    separateGenders: true,
    keepGroupsTogether: false,
    keepApart: [],
    reassignAll: true,
  });

  assert.notEqual(plan.placements.get("ava"), plan.placements.get("eli"));
});

test("rooms: a room that requires a leader gets one first", () => {
  const roster = people([
    ["Dana", { isLeader: true, gender: "Female" }],
    ["Ava", { gender: "Female" }],
    ["Ivy", { gender: "Female" }],
  ]);

  const plan = autoAssignRooms({
    people: roster,
    rooms: [
      { id: "chaperoned", name: "Room 201", capacity: 2, designation: "FEMALE", requiresLeader: true },
      { id: "plain", name: "Room 202", capacity: 2, designation: "FEMALE", requiresLeader: false },
    ],
    existing: new Map(),
    separateGenders: true,
    keepGroupsTogether: false,
    keepApart: [],
    reassignAll: true,
  });

  assert.equal(plan.placements.get("dana"), "chaperoned");
});

test("rooms: people marked to stay apart are not put together", () => {
  const roster = people([["Ava"], ["Ivy"]]);

  const plan = autoAssignRooms({
    people: roster,
    rooms: [
      { id: "r1", name: "Room 201", capacity: 4, designation: "ANY", requiresLeader: false },
      { id: "r2", name: "Room 202", capacity: 4, designation: "ANY", requiresLeader: false },
    ],
    existing: new Map(),
    separateGenders: false,
    keepGroupsTogether: false,
    keepApart: [["ava", "ivy"]],
    reassignAll: true,
  });

  assert.notEqual(plan.placements.get("ava"), plan.placements.get("ivy"));
});

test("rooms: existing assignments are kept unless a full reassign is requested", () => {
  const roster = people([["Ava"], ["Ivy"]]);
  const existing = new Map([["ava", "r2"]]);

  const kept = autoAssignRooms({
    people: roster,
    rooms: [
      { id: "r1", name: "Room 201", capacity: 4, designation: "ANY", requiresLeader: false },
      { id: "r2", name: "Room 202", capacity: 4, designation: "ANY", requiresLeader: false },
    ],
    existing,
    separateGenders: false,
    keepGroupsTogether: false,
    keepApart: [],
    reassignAll: false,
  });

  assert.equal(kept.placements.get("ava"), "r2");
});
