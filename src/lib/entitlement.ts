import type { Entitlement } from "@prisma/client";

/**
 * What a church can do, and when it has to pay.
 *
 * This is pure policy — no database, no secrets, no server-only resources — so
 * it can be read from either side of the boundary and its callers decide where
 * the enforcement happens.
 *
 * The rule the whole file exists to enforce: free setup is the *real*
 * application on the *real* database, not a demo or a trial. A church builds
 * its trip, sees the dashboard, and reaches the point where the product is
 * obviously useful — and only then, on the actions that mean "we are running
 * this trip for real", is it asked to pay once.
 *
 * Two things follow, and both are load-bearing:
 *
 *   - Nothing is ever deleted, hidden, or locked because someone has not paid.
 *     A leader who declines can keep setting up, keep editing, and come back
 *     later to everything exactly as they left it.
 *   - Gates sit on the actions, never on reading. A church can always see its
 *     own data.
 */

export const PAID_ENTITLEMENTS: Entitlement[] = ["LIFETIME", "MANUAL_LIFETIME", "DEMO"];

/** How many attendees a church can add before paying. */
export const FREE_SETUP_ATTENDEE_LIMIT = 10;

/**
 * The actions that mean "we are using this trip for real". Everything else —
 * creating the organization and trip, entering details, guardians, waiver
 * templates, vehicles, rooms, itinerary, tasks, prayer focuses, the dashboard,
 * Trip Readiness — is free, because a leader has to reach the useful moment
 * before being asked for anything.
 */
export type PaidFeature =
  | "attendees-beyond-free-limit"
  | "waiver-signing-links"
  | "leader-invitations"
  | "headcount"
  | "trip-packet";

const FEATURE_COPY: Record<PaidFeature, { title: string; body: string }> = {
  "attendees-beyond-free-limit": {
    title: "Add your whole group",
    body: `Free setup covers your first ${FREE_SETUP_ATTENDEE_LIMIT} people so you can see how the trip comes together. Unlock Ready Set Amen to add everyone else.`,
  },
  "waiver-signing-links": {
    title: "Send waivers to parents",
    body: "Your waiver is ready. Unlock Ready Set Amen to generate secure signing links and start collecting real signatures.",
  },
  "leader-invitations": {
    title: "Bring your leaders in",
    body: "Unlock Ready Set Amen to invite the rest of your leaders. They will not pay anything — your church is covered once.",
  },
  headcount: {
    title: "Run a live headcount",
    body: "Unlock Ready Set Amen to count your group from your phone and see instantly who is missing.",
  },
  "trip-packet": {
    title: "Print your trip packet",
    body: "Unlock Ready Set Amen to build and print the packet your leaders carry — rosters, assignments, contacts, and schedule.",
  },
};

export function isPaid(entitlement: Entitlement): boolean {
  return PAID_ENTITLEMENTS.includes(entitlement);
}

/** True when this organization may use the feature right now. */
export function allows(entitlement: Entitlement, _feature: PaidFeature): boolean {
  // Every paid feature is unlocked by the same one-time purchase; there are no
  // tiers, and adding one would mean a permissions matrix this product does not
  // want. The parameter is kept so callers read as a question about a feature.
  return isPaid(entitlement);
}

export function featureCopy(feature: PaidFeature): { title: string; body: string } {
  return FEATURE_COPY[feature];
}

/**
 * Where an unpaid church is sent when it tries a paid action. The feature and
 * the page it came from ride along so the unlock screen can explain what they
 * were doing and send them back to it afterwards.
 */
export function unlockPath(slug: string, feature: PaidFeature, returnTo?: string): string {
  const params = new URLSearchParams({ feature });
  if (returnTo) params.set("next", returnTo);
  return `/orgs/${slug}/unlock?${params.toString()}`;
}

/** How the free-setup badge and billing page describe the current state. */
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
