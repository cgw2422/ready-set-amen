import type { Entitlement } from "@prisma/client";

/**
 * What a church can do, and when it has to pay. The single source of truth.
 *
 * Every gate in the product answers a question defined here, and both the UI
 * and the server action behind it ask the same function. Nothing else in the
 * codebase should compare an entitlement value directly — scattered checks are
 * how a paywall ends up inconsistent, with a button hidden in one place and the
 * action still reachable in another.
 *
 * This is pure policy: no database, no secrets, no server-only resources, so it
 * can be read from either side of the boundary. Enforcement lives in
 * `src/lib/access.ts`, which resolves the organization first and then applies
 * these answers.
 *
 * The philosophy, in one line each:
 *
 *   FREE_SETUP  Build and experience your first trip.
 *   LIFETIME    Actually run the trip, without limits.
 *
 * Free setup is the real application on the real database. Nothing is deleted,
 * hidden or locked for not paying, gates sit on actions rather than on reading,
 * and a church can always see and edit what it has already entered — including
 * medical notes and emergency contacts, which are never behind a paywall.
 */

/** Entitlement states with no limits at all. */
export const FULL_ACCESS: readonly Entitlement[] = ["LIFETIME", "MANUAL_LIFETIME", "DEMO"];

/** What free setup includes. */
export const FREE_SETUP = {
  /** Exactly one trip: enough to build the thing and see it work. */
  trips: 1,
  /** Ten people: enough for vans, rooms and a readiness score to mean something. */
  attendees: 10,
} as const;

/**
 * Ceilings that apply to everyone, paid included. Not a pricing boundary — a
 * limit on what one upload can ask the server to do in a single request.
 */
export const IMPORT_LIMITS = {
  /** 2 MB. A 1,000-person roster as CSV is roughly 150 KB. */
  maxBytes: 2 * 1024 * 1024,
  /** Rows accepted from one file, after the header. */
  maxRows: 1000,
  /** Columns read from the header row. */
  maxColumns: 60,
  /** Characters kept from any single cell. */
  maxCellLength: 2000,
} as const;

/** Every paid boundary in the product. Adding one means adding it here first. */
export type Gate =
  | "second-trip"
  | "attendee-limit"
  | "waiver-signing-links"
  | "leader-invitations"
  | "headcount"
  | "trip-packet";

export type Decision = { allowed: true } | { allowed: false; gate: Gate; detail?: string };

const ALLOW: Decision = { allowed: true };

function deny(gate: Gate, detail?: string): Decision {
  return { allowed: false, gate, detail };
}

type Org = { entitlement: Entitlement };

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------

export function hasFullAccess(organization: Org): boolean {
  return FULL_ACCESS.includes(organization.entitlement);
}

/** Free setup includes one trip. The second is where the ask happens. */
export function canCreateTrip(organization: Org, existingTrips: number): Decision {
  if (hasFullAccess(organization)) return ALLOW;
  if (existingTrips < FREE_SETUP.trips) return ALLOW;
  return deny("second-trip");
}

/**
 * How the attendee limit applies, whatever the entry method. Manual, bulk,
 * CSV and Excel all come through here: importing is free, and the ten-person
 * ceiling is the only attendee boundary.
 */
export function canAddAttendee(organization: Org, currentCount: number, adding = 1): Decision {
  if (hasFullAccess(organization)) return ALLOW;
  const remaining = Math.max(0, FREE_SETUP.attendees - currentCount);
  if (adding <= remaining) return ALLOW;
  return deny(
    "attendee-limit",
    remaining === 0
      ? `You have ${currentCount} people, which is everything free setup includes.`
      : `Free Setup includes up to ${FREE_SETUP.attendees} attendees. You currently have ${currentCount} ${
          currentCount === 1 ? "person" : "people"
        }, so you can add ${remaining} more before unlocking lifetime access.`,
  );
}

/** How many more people this church may add, or null when there is no limit. */
export function freeAttendeeSpotsLeft(organization: Org, currentCount: number): number | null {
  if (hasFullAccess(organization)) return null;
  return Math.max(0, FREE_SETUP.attendees - currentCount);
}

/** Creating and previewing a waiver is free; issuing a real signing token is not. */
export function canCreateSigningLink(organization: Org): Decision {
  return hasFullAccess(organization) ? ALLOW : deny("waiver-signing-links");
}

/** Looking at the headcount screen is free; recording a real one is not. */
export function canRunHeadcount(organization: Org): Decision {
  return hasFullAccess(organization) ? ALLOW : deny("headcount");
}

export function canInviteLeader(organization: Org): Decision {
  return hasFullAccess(organization) ? ALLOW : deny("leader-invitations");
}

/** Reading trip information is free; the printed operational pack is not. */
export function canGenerateTripPacket(organization: Org): Decision {
  return hasFullAccess(organization) ? ALLOW : deny("trip-packet");
}

// ---------------------------------------------------------------------------
// What the unlock screen says
// ---------------------------------------------------------------------------

const GATE_COPY: Record<Gate, { title: string; body: string }> = {
  "second-trip": {
    title: "Planning another trip?",
    body: "Unlock Ready Set Amen for lifetime access and unlimited trips.",
  },
  "attendee-limit": {
    title: "Ready for your whole group?",
    body: `Free setup covers your first ${FREE_SETUP.attendees} people so you can see the trip come together. Unlock Ready Set Amen to add everyone else.`,
  },
  "waiver-signing-links": {
    title: "Your waiver is ready to go.",
    body: "Unlock Ready Set Amen to send secure signing links to parents and attendees.",
  },
  "leader-invitations": {
    title: "Bring your leaders in.",
    body: "Unlock Ready Set Amen to invite additional leaders and plan together. They will not pay anything — your church is covered once.",
  },
  headcount: {
    title: "Ready to hit the road?",
    body: "Unlock Ready Set Amen to run live mobile headcounts throughout your trip.",
  },
  "trip-packet": {
    title: "Everything's coming together.",
    body: "Unlock Ready Set Amen to print and export your complete trip information.",
  },
};

export function gateCopy(gate: Gate): { title: string; body: string } {
  return GATE_COPY[gate];
}

export function isGate(value: unknown): value is Gate {
  return typeof value === "string" && value in GATE_COPY;
}

/** Where a blocked action sends someone, carrying what they were doing. */
export function unlockPath(slug: string, gate?: Gate, returnTo?: string, detail?: string): string {
  const params = new URLSearchParams();
  if (gate) params.set("gate", gate);
  if (returnTo) params.set("next", returnTo);
  if (detail) params.set("detail", detail);
  const query = params.toString();
  return `/orgs/${slug}/unlock${query ? `?${query}` : ""}`;
}

/** How the free-setup badge and the billing card describe the current state. */
export function entitlementLabel(entitlement: Entitlement): string {
  switch (entitlement) {
    case "LIFETIME":
    case "MANUAL_LIFETIME":
      return "Ready Set Amen Lifetime Access";
    case "DEMO":
      return "Ready Set Amen Demo";
    default:
      return "Ready Set Amen Free Setup";
  }
}
