/**
 * Trip Readiness — docs/ARCHITECTURE.md §8.
 *
 * The computation is a pure function over a snapshot so it can be unit tested
 * and so the dashboard only ever runs one round of queries.
 *
 * Two rules the rest of the app depends on:
 *   1. A category with nothing to complete is *not applicable* and drops out of
 *      both the numerator and the denominator. A day trip with no lodging is
 *      not 90% ready because it has no rooms.
 *   2. The prayer step is never part of the score.
 */

export const READINESS_CATEGORIES = [
  { key: "attendees", label: "Attendee information", weight: 20 },
  { key: "waivers", label: "Waivers", weight: 25 },
  { key: "forms", label: "Required forms", weight: 10 },
  { key: "payments", label: "Payments", weight: 15 },
  { key: "transportation", label: "Transportation", weight: 10 },
  { key: "lodging", label: "Lodging", weight: 10 },
  { key: "leaders", label: "Leader assignments", weight: 5 },
  { key: "tasks", label: "Preparation tasks", weight: 5 },
] as const;

export type ReadinessCategoryKey = (typeof READINESS_CATEGORIES)[number]["key"];

export type ReadinessConfig = Partial<
  Record<ReadinessCategoryKey, { enabled?: boolean; weight?: number }>
>;

export type AttendeeSnapshot = {
  id: string;
  name: string;
  isMinor: boolean;
  isLeader: boolean;
  hasEmergencyContact: boolean;
  hasGuardian: boolean;
  amountDue: number;
  amountPaid: number;
  paymentSettled: boolean;
  vehicleId: string | null;
  roomId: string | null;
};

export type ReadinessInput = {
  config: ReadinessConfig;
  attendees: AttendeeSnapshot[];
  waivers: { required: number; signed: number; notRequired: number; sent: number; viewed: number };
  forms: { required: number; complete: number };
  vehicles: { id: string; name: string; capacity: number; assigned: number; hasDriver: boolean }[];
  rooms: {
    id: string;
    name: string;
    capacity: number;
    assigned: number;
    requiresLeader: boolean;
    leaderCount: number;
  }[];
  leaders: { role: string; filled: boolean; required: boolean }[];
  tasks: { id: string; title: string; done: boolean; isPrayerStep: boolean }[];
  prayerCompletedAt: Date | null;
};

export type CategoryResult = {
  key: ReadinessCategoryKey;
  label: string;
  weight: number;
  enabled: boolean;
  applicable: boolean;
  complete: number;
  total: number;
  ratio: number;
  summary: string;
};

export type TripIssue = {
  severity: "action" | "warning" | "info";
  message: string;
  category: ReadinessCategoryKey | "prayer";
};

export type ReadinessResult = {
  percent: number;
  logisticsComplete: boolean;
  prayerComplete: boolean;
  allDone: boolean;
  categories: CategoryResult[];
  issues: TripIssue[];
};

function ratio(complete: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, complete / total));
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const issues: TripIssue[] = [];
  const attendees = input.attendees;
  const participantCount = attendees.length;

  // --- Attendee information -------------------------------------------------
  const missingEmergency = attendees.filter((a) => !a.hasEmergencyContact);
  const minorsMissingGuardian = attendees.filter((a) => a.isMinor && !a.hasGuardian);
  const attendeeComplete = attendees.filter(
    (a) => a.hasEmergencyContact && (!a.isMinor || a.hasGuardian),
  ).length;

  if (missingEmergency.length > 0) {
    issues.push({
      severity: "action",
      category: "attendees",
      message: `${missingEmergency.length} ${plural(missingEmergency.length, "attendee is", "attendees are")} missing emergency contacts.`,
    });
  }
  if (minorsMissingGuardian.length > 0) {
    issues.push({
      severity: "action",
      category: "attendees",
      message: `${minorsMissingGuardian.length} ${plural(minorsMissingGuardian.length, "minor needs", "minors need")} a parent or guardian on file.`,
    });
  }

  // --- Waivers --------------------------------------------------------------
  const waiverDenominator = input.waivers.required;
  const waiverNumerator = input.waivers.signed + input.waivers.notRequired;
  const waiversOutstanding = Math.max(0, waiverDenominator - waiverNumerator);
  if (waiversOutstanding > 0) {
    issues.push({
      severity: "action",
      category: "waivers",
      message: `${waiversOutstanding} ${plural(waiversOutstanding, "waiver", "waivers")} still ${plural(waiversOutstanding, "needs", "need")} a signature.`,
    });
  }

  // --- Forms ----------------------------------------------------------------
  const formsOutstanding = Math.max(0, input.forms.required - input.forms.complete);
  if (formsOutstanding > 0) {
    issues.push({
      severity: "warning",
      category: "forms",
      message: `${formsOutstanding} required ${plural(formsOutstanding, "form is", "forms are")} still outstanding.`,
    });
  }

  // --- Payments -------------------------------------------------------------
  const totalDue = attendees.reduce((sum, a) => sum + a.amountDue, 0);
  const totalPaid = attendees.reduce((sum, a) => sum + Math.min(a.amountPaid, a.amountDue), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const payersSettled = attendees.filter((a) => a.paymentSettled).length;
  if (outstanding > 0.004) {
    issues.push({
      severity: "warning",
      category: "payments",
      message: `${money(outstanding)} remains unpaid.`,
    });
  }

  // --- Transportation -------------------------------------------------------
  const hasVehicles = input.vehicles.length > 0;
  const unassignedRiders = attendees.filter((a) => !a.vehicleId);
  const overCapacityVehicles = input.vehicles.filter((v) => v.assigned > v.capacity);
  const driverlessVehicles = input.vehicles.filter((v) => !v.hasDriver);

  if (hasVehicles && unassignedRiders.length > 0) {
    issues.push({
      severity: "action",
      category: "transportation",
      message: `${unassignedRiders.length} ${plural(unassignedRiders.length, "attendee is", "attendees are")} not assigned to a vehicle.`,
    });
  }
  for (const v of overCapacityVehicles) {
    issues.push({
      severity: "action",
      category: "transportation",
      message: `${v.name} has ${v.assigned} riders for ${v.capacity} ${plural(v.capacity, "seat", "seats")}.`,
    });
  }
  for (const v of driverlessVehicles) {
    issues.push({
      severity: "warning",
      category: "transportation",
      message: `${v.name} still needs a driver.`,
    });
  }

  // Transportation completion counts three things: seated riders, vehicles
  // within capacity, and vehicles with a driver.
  const transportUnits = hasVehicles ? participantCount + input.vehicles.length * 2 : 0;
  const transportComplete = hasVehicles
    ? participantCount -
      unassignedRiders.length +
      (input.vehicles.length - overCapacityVehicles.length) +
      (input.vehicles.length - driverlessVehicles.length)
    : 0;

  // --- Lodging --------------------------------------------------------------
  const hasRooms = input.rooms.length > 0;
  const unassignedSleepers = attendees.filter((a) => !a.roomId);
  const overCapacityRooms = input.rooms.filter((r) => r.assigned > r.capacity);
  const roomsMissingLeader = input.rooms.filter(
    (r) => r.requiresLeader && r.assigned > 0 && r.leaderCount === 0,
  );

  if (hasRooms && unassignedSleepers.length > 0) {
    issues.push({
      severity: "action",
      category: "lodging",
      message: `${unassignedSleepers.length} ${plural(unassignedSleepers.length, "attendee is", "attendees are")} not assigned to a room.`,
    });
  }
  for (const r of overCapacityRooms) {
    issues.push({
      severity: "action",
      category: "lodging",
      message: `${r.name} is over capacity — ${r.assigned} people for ${r.capacity} ${plural(r.capacity, "spot", "spots")}.`,
    });
  }
  for (const r of roomsMissingLeader) {
    issues.push({
      severity: "warning",
      category: "lodging",
      message: `${r.name} needs an adult leader.`,
    });
  }

  const lodgingUnits = hasRooms ? participantCount + input.rooms.length : 0;
  const lodgingComplete = hasRooms
    ? participantCount - unassignedSleepers.length + (input.rooms.length - overCapacityRooms.length)
    : 0;

  // --- Leaders --------------------------------------------------------------
  const requiredRoles = input.leaders.filter((l) => l.required);
  const unfilledRequired = requiredRoles.filter((l) => !l.filled);
  for (const role of unfilledRequired) {
    issues.push({
      severity: "warning",
      category: "leaders",
      message: `No one is assigned to ${role.role} yet.`,
    });
  }
  const leaderTotal = input.leaders.length;
  const leaderComplete = input.leaders.filter((l) => l.filled).length;

  // --- Preparation tasks (prayer step excluded) -----------------------------
  const logisticTasks = input.tasks.filter((t) => !t.isPrayerStep);
  const tasksDone = logisticTasks.filter((t) => t.done).length;
  const tasksOutstanding = logisticTasks.length - tasksDone;
  if (tasksOutstanding > 0) {
    issues.push({
      severity: "info",
      category: "tasks",
      message: `${tasksOutstanding} preparation ${plural(tasksOutstanding, "task is", "tasks are")} still open.`,
    });
  }

  const raw: Record<ReadinessCategoryKey, { complete: number; total: number; summary: string }> = {
    attendees: {
      complete: attendeeComplete,
      total: participantCount,
      summary: `${attendeeComplete} / ${participantCount} complete`,
    },
    waivers: {
      complete: waiverNumerator,
      total: waiverDenominator,
      summary: `${input.waivers.signed} / ${waiverDenominator} signed`,
    },
    forms: {
      complete: input.forms.complete,
      total: input.forms.required,
      summary: `${input.forms.complete} / ${input.forms.required} complete`,
    },
    payments: {
      complete: payersSettled,
      total: participantCount,
      summary: `${money(totalPaid)} / ${money(totalDue)} collected`,
    },
    transportation: {
      complete: transportComplete,
      total: transportUnits,
      summary: hasVehicles
        ? `${input.vehicles.length - overCapacityVehicles.length - driverlessVehicles.length} / ${input.vehicles.length} ${plural(input.vehicles.length, "vehicle", "vehicles")} ready`
        : "No vehicles yet",
    },
    lodging: {
      complete: lodgingComplete,
      total: lodgingUnits,
      summary: hasRooms
        ? `${participantCount - unassignedSleepers.length} / ${participantCount} assigned`
        : "No rooms yet",
    },
    leaders: {
      complete: leaderComplete,
      total: leaderTotal,
      summary: leaderTotal > 0 ? `${leaderComplete} / ${leaderTotal} assigned` : "No roles yet",
    },
    tasks: {
      complete: tasksDone,
      total: logisticTasks.length,
      summary: `${tasksDone} / ${logisticTasks.length} done`,
    },
  };

  // Payments: use the money ratio rather than the head count when there is a
  // real balance, because "38 of 40 people paid" hides a $900 gap.
  if (totalDue > 0) {
    raw.payments.complete = Math.round(totalPaid * 100);
    raw.payments.total = Math.round(totalDue * 100);
  }

  const categories: CategoryResult[] = READINESS_CATEGORIES.map((meta) => {
    const override = input.config?.[meta.key] ?? {};
    const enabled = override.enabled !== false;
    const weight = typeof override.weight === "number" ? override.weight : meta.weight;
    const data = raw[meta.key];
    return {
      key: meta.key,
      label: meta.label,
      weight,
      enabled,
      applicable: enabled && data.total > 0,
      complete: data.complete,
      total: data.total,
      ratio: ratio(data.complete, data.total),
      summary: data.summary,
    };
  });

  const applicable = categories.filter((c) => c.applicable && c.weight > 0);
  const weightSum = applicable.reduce((sum, c) => sum + c.weight, 0);
  const percent =
    weightSum === 0
      ? 0
      : Math.round(
          (applicable.reduce((sum, c) => sum + c.weight * c.ratio, 0) / weightSum) * 100,
        );

  const logisticsComplete = weightSum > 0 && applicable.every((c) => c.ratio >= 1);
  const prayerComplete = input.prayerCompletedAt !== null;

  if (logisticsComplete && !prayerComplete) {
    issues.push({
      severity: "info",
      category: "prayer",
      message: "You've checked the boxes. Now let's cover the trip in prayer.",
    });
  }

  return {
    percent,
    logisticsComplete,
    prayerComplete,
    allDone: logisticsComplete && prayerComplete,
    categories,
    issues,
  };
}
