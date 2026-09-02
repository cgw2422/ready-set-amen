/**
 * Auto Assign for vehicles and rooms.
 *
 * Plain, deterministic application logic — no AI, no randomness. Given the same
 * roster the result is identical every time, which matters because a leader who
 * re-runs it after adding one student should not see the whole van shuffle.
 *
 * Every result is a suggestion: the UI always allows manual override.
 */

export type AssignPerson = {
  id: string;
  name: string;
  isLeader: boolean;
  gender: string | null;
  /** People sharing a group key stay together when possible (families, buddies). */
  groupKey: string | null;
  /** Already assigned and not being moved. */
  lockedTo?: string | null;
  /** Must be placed with this specific leader (vehicles only). */
  mustRideWithAttendeeId?: string | null;
};

export type AssignVehicle = {
  id: string;
  name: string;
  capacity: number;
  reservedSeats: number;
  driverAttendeeId: string | null;
  secondaryDriverAttendeeId: string | null;
};

export type AssignRoom = {
  id: string;
  name: string;
  capacity: number;
  /** "MALE" | "FEMALE" | "ANY" or a free-text group designation. */
  designation: string;
  requiresLeader: boolean;
};

export type AssignmentPlan = {
  /** personId -> containerId */
  placements: Map<string, string>;
  unplaced: { person: AssignPerson; reason: string }[];
};

function normalizeGender(value: string | null): "M" | "F" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith("m") || v === "boy" || v === "male") return "M";
  if (v.startsWith("f") || v === "girl" || v === "woman" || v === "female") return "F";
  return null;
}

/** Stable ordering so repeated runs produce the same plan. */
function byName(a: AssignPerson, b: AssignPerson) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function groupPeople(people: AssignPerson[]): AssignPerson[][] {
  const groups = new Map<string, AssignPerson[]>();
  for (const person of people) {
    const key = person.groupKey?.trim() ? `g:${person.groupKey.trim().toLowerCase()}` : `s:${person.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(person);
    else groups.set(key, [person]);
  }
  return [...groups.values()]
    .map((g) => g.sort(byName))
    .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export function autoAssignVehicles(params: {
  people: AssignPerson[];
  vehicles: AssignVehicle[];
  /** personId -> vehicleId for people already seated and staying put. */
  existing: Map<string, string>;
  keepGroupsTogether: boolean;
  reassignAll: boolean;
}): AssignmentPlan {
  const { people, vehicles, existing, keepGroupsTogether, reassignAll } = params;
  const placements = new Map<string, string>();
  const unplaced: AssignmentPlan["unplaced"] = [];

  const remaining = new Map<string, number>();
  for (const v of vehicles) {
    remaining.set(v.id, Math.max(0, v.capacity - Math.max(0, v.reservedSeats)));
  }
  if (vehicles.length === 0) {
    return { placements, unplaced: people.map((p) => ({ person: p, reason: "No vehicles yet" })) };
  }

  const take = (vehicleId: string, personId: string) => {
    placements.set(personId, vehicleId);
    remaining.set(vehicleId, (remaining.get(vehicleId) ?? 0) - 1);
  };

  // 1. Drivers occupy a seat in the vehicle they drive.
  const driverOf = new Map<string, string>();
  for (const v of vehicles) {
    for (const id of [v.driverAttendeeId, v.secondaryDriverAttendeeId]) {
      if (id) driverOf.set(id, v.id);
    }
  }

  // 2. Honour seats that are already taken.
  const pending: AssignPerson[] = [];
  for (const person of people) {
    const driving = driverOf.get(person.id);
    if (driving && remaining.has(driving)) {
      take(driving, person.id);
      continue;
    }
    const keep = !reassignAll ? (person.lockedTo ?? existing.get(person.id) ?? null) : null;
    if (keep && remaining.has(keep)) {
      take(keep, person.id);
      continue;
    }
    pending.push(person);
  }

  // 3. "Must ride with" wins over everything else that is still open.
  const stillPending: AssignPerson[] = [];
  for (const person of pending) {
    const anchor = person.mustRideWithAttendeeId;
    const anchorVehicle = anchor ? (placements.get(anchor) ?? driverOf.get(anchor) ?? null) : null;
    if (anchorVehicle && (remaining.get(anchorVehicle) ?? 0) > 0) {
      take(anchorVehicle, person.id);
    } else {
      stillPending.push(person);
    }
  }

  // 4. Give every vehicle an adult leader before filling seats.
  const leaders = stillPending.filter((p) => p.isLeader).sort(byName);
  const riders = stillPending.filter((p) => !p.isLeader);
  const leaderCount = new Map<string, number>();
  for (const [personId, vehicleId] of placements) {
    if (people.find((p) => p.id === personId)?.isLeader) {
      leaderCount.set(vehicleId, (leaderCount.get(vehicleId) ?? 0) + 1);
    }
  }
  const leaderQueue = [...leaders];
  for (const v of vehicles) {
    if ((leaderCount.get(v.id) ?? 0) > 0) continue;
    const next = leaderQueue.findIndex(() => true);
    if (next === -1) break;
    if ((remaining.get(v.id) ?? 0) <= 0) continue;
    const leader = leaderQueue.splice(next, 1)[0];
    take(v.id, leader.id);
    leaderCount.set(v.id, 1);
  }

  // 5. Everyone else, biggest group first into the vehicle with the most room.
  const toPlace = keepGroupsTogether
    ? groupPeople([...leaderQueue, ...riders])
    : [...leaderQueue, ...riders].sort(byName).map((p) => [p]);

  for (const group of toPlace) {
    const target = vehicles
      .filter((v) => (remaining.get(v.id) ?? 0) >= group.length)
      .sort((a, b) => (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0))[0];

    if (target) {
      for (const person of group) take(target.id, person.id);
      continue;
    }
    // The group does not fit anywhere intact — split it across open seats.
    for (const person of group) {
      const fallback = vehicles
        .filter((v) => (remaining.get(v.id) ?? 0) > 0)
        .sort((a, b) => (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0))[0];
      if (fallback) take(fallback.id, person.id);
      else unplaced.push({ person, reason: "No seats left" });
    }
  }

  return { placements, unplaced };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export function autoAssignRooms(params: {
  people: AssignPerson[];
  rooms: AssignRoom[];
  existing: Map<string, string>;
  separateGenders: boolean;
  keepGroupsTogether: boolean;
  /** Pairs of person ids that must not share a room. */
  keepApart: [string, string][];
  reassignAll: boolean;
}): AssignmentPlan {
  const { people, rooms, existing, separateGenders, keepGroupsTogether, keepApart, reassignAll } =
    params;
  const placements = new Map<string, string>();
  const unplaced: AssignmentPlan["unplaced"] = [];

  if (rooms.length === 0) {
    return { placements, unplaced: people.map((p) => ({ person: p, reason: "No rooms yet" })) };
  }

  const remaining = new Map(rooms.map((r) => [r.id, Math.max(0, r.capacity)]));
  const occupants = new Map<string, AssignPerson[]>(rooms.map((r) => [r.id, []]));
  const apart = new Map<string, Set<string>>();
  for (const [a, b] of keepApart) {
    if (!apart.has(a)) apart.set(a, new Set());
    if (!apart.has(b)) apart.set(b, new Set());
    apart.get(a)!.add(b);
    apart.get(b)!.add(a);
  }

  const take = (roomId: string, person: AssignPerson) => {
    placements.set(person.id, roomId);
    remaining.set(roomId, (remaining.get(roomId) ?? 0) - 1);
    occupants.get(roomId)!.push(person);
  };

  const roomAccepts = (room: AssignRoom, person: AssignPerson, size = 1): boolean => {
    if ((remaining.get(room.id) ?? 0) < size) return false;
    if (separateGenders) {
      const designation = room.designation?.toUpperCase();
      const gender = normalizeGender(person.gender);
      if (designation === "MALE" && gender !== "M") return false;
      if (designation === "FEMALE" && gender !== "F") return false;
      if (designation === "ANY" || !designation) {
        // Mixed-use rooms still keep one gender per room once someone is in it.
        const current = occupants.get(room.id)!;
        const existingGender = current.map((p) => normalizeGender(p.gender)).find(Boolean) ?? null;
        if (existingGender && gender && existingGender !== gender) return false;
      }
    }
    const enemies = apart.get(person.id);
    if (enemies && occupants.get(room.id)!.some((o) => enemies.has(o.id))) return false;
    return true;
  };

  // Keep people who are already placed.
  const pending: AssignPerson[] = [];
  for (const person of people) {
    const keep = !reassignAll ? (person.lockedTo ?? existing.get(person.id) ?? null) : null;
    if (keep && remaining.has(keep) && (remaining.get(keep) ?? 0) > 0) take(keep, person);
    else pending.push(person);
  }

  // Rooms that require a leader get one first.
  const leaders = pending.filter((p) => p.isLeader).sort(byName);
  for (const room of rooms.filter((r) => r.requiresLeader)) {
    if (occupants.get(room.id)!.some((o) => o.isLeader)) continue;
    const index = leaders.findIndex((l) => roomAccepts(room, l));
    if (index === -1) continue;
    take(room.id, leaders.splice(index, 1)[0]);
  }

  const rest = [...leaders, ...pending.filter((p) => !p.isLeader)];
  const groups = keepGroupsTogether ? groupPeople(rest) : rest.sort(byName).map((p) => [p]);

  for (const group of groups) {
    const target = rooms
      .filter((r) => group.every((p) => roomAccepts(r, p, group.length)))
      // Fill rooms up rather than spreading thin — fewer half-empty rooms.
      .sort((a, b) => (remaining.get(a.id) ?? 0) - (remaining.get(b.id) ?? 0))[0];

    if (target) {
      for (const person of group) take(target.id, person);
      continue;
    }
    for (const person of group) {
      const fallback = rooms
        .filter((r) => roomAccepts(r, person))
        .sort((a, b) => (remaining.get(a.id) ?? 0) - (remaining.get(b.id) ?? 0))[0];
      if (fallback) take(fallback.id, person);
      else
        unplaced.push({
          person,
          reason: separateGenders ? "No matching room with space" : "No space left",
        });
    }
  }

  return { placements, unplaced };
}
