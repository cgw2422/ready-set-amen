/**
 * The permanent showcase organization.
 *
 * Everything about the demo is ordinary application data: a real organization
 * row, a real trip, real waiver records. The only thing that marks it is
 * `Organization.isDemo`, and that flag exists for exactly one reason — so the
 * destructive `demo reset` tooling can refuse to touch anything else. It never
 * changes behaviour, never appears in the UI, and never relaxes authorization.
 */

export const DEMO_ORG_NAME = "Ready Set Amen Demo Church";
export const DEMO_ORG_SLUG = "ready-set-amen-demo";
export const DEMO_OWNER_EMAIL = "demo@readysetamen.com";
export const DEMO_TRIP_NAME_PREFIX = "Ohio Youth Convention";

/**
 * The demo is permanent, so its trip cannot be pinned to a fixed date — a trip
 * that has already happened makes the dashboard read as history instead of as
 * work still to do. The trip is always seeded ten weeks out, and its name
 * carries whatever year that lands in.
 */
export const DEMO_TRIP_LEAD_DAYS = 70;

/** Midnight UTC, `DEMO_TRIP_LEAD_DAYS` from `from`. */
export function demoTripStart(from: Date = new Date()): Date {
  const start = new Date(from.getTime() + DEMO_TRIP_LEAD_DAYS * 86_400_000);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
}

export function demoTripName(start: Date = demoTripStart()): string {
  return `${DEMO_TRIP_NAME_PREFIX} ${start.getUTCFullYear()}`;
}

/** Shown inside the waiver template so nobody mistakes it for approved wording. */
export const DEMO_WAIVER_NOTICE =
  "DEMONSTRATION TEXT ONLY — this wording is fictional sample content used to " +
  "show how Ready Set Amen collects signatures. It has not been reviewed by an " +
  "attorney and must not be used for a real trip.";
