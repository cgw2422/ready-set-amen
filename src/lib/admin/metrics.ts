import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * What the platform owner sees at /admin.
 *
 * Every number here answers "how is Ready Set Amen actually doing?", so the
 * definitions matter more than the queries. They are stated once, in this file,
 * and the dashboard renders them without reinterpreting anything.
 *
 * ---------------------------------------------------------------------------
 * Real vs. demo
 * ---------------------------------------------------------------------------
 *
 * The showcase church exists to be clicked around by strangers. Counting it as
 * adoption would be lying to myself, so every business metric excludes it.
 *
 *   A real organization is one with `isDemo = false`.
 *
 *   A real account is a user who is neither flagged `isSystem` nor a member of
 *   *only* demo organizations. Someone who belongs to a real church and has
 *   also been shown the demo still counts — the exclusion is for accounts that
 *   exist solely to run the showcase, identified by a durable flag and by
 *   membership, never by guessing at an email string. A user with no membership
 *   at all is a genuine signup who has not created their church yet, and counts.
 *
 * Demo counts are reported separately so they are visible without being mixed in.
 */

// ---------------------------------------------------------------------------
// The filters every metric is built from
// ---------------------------------------------------------------------------

/** Organizations that represent real churches. */
const REAL_ORG: Prisma.OrganizationWhereInput = { isDemo: false };

/** Trips, attendees and waivers belonging to a real church. */
const REAL_TRIP: Prisma.TripWhereInput = { organization: REAL_ORG };
const REAL_ATTENDEE: Prisma.AttendeeWhereInput = { trip: REAL_TRIP };

/**
 * Accounts that represent real people using the product.
 *
 * "Not a member of only demo organizations" is expressed as "has no membership
 * in a demo organization, or has at least one in a real one" — which Prisma
 * states directly as: none of their memberships is demo, OR some membership is
 * real.
 */
const REAL_USER: Prisma.UserWhereInput = {
  isSystem: false,
  OR: [
    { memberships: { none: { organization: { isDemo: true } } } },
    { memberships: { some: { organization: REAL_ORG } } },
  ],
};

/** A completed Stripe purchase against a real church. */
const REAL_STRIPE_PURCHASE: Prisma.PurchaseWhereInput = {
  source: "STRIPE_CHECKOUT",
  organization: REAL_ORG,
};

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// All time
// ---------------------------------------------------------------------------

export type AllTimeMetrics = {
  /** Genuine user accounts created since launch. Excludes demo-only accounts. */
  accountsCreated: number;
  /** Real Organization rows created. FREE_SETUP churches are real signups and count. */
  organizationsCreated: number;
  /**
   * Real Trip rows created, whatever the church's entitlement. A FREE_SETUP
   * first trip counts: it is the signal that someone started using the product
   * before paying.
   */
  tripsStarted: number;

  /** Real organizations that bought lifetime access through Stripe. */
  paidOrganizations: number;
  /** Real organizations currently in FREE_SETUP. */
  freeSetupOrganizations: number;
  /** Real organizations whose access was granted from the CLI, not bought. */
  manualLifetimeOrganizations: number;

  totalAttendees: number;
  signedWaivers: number;

  /** Completed Stripe purchases. Can exceed paidOrganizations if one ever repurchases. */
  lifetimePurchases: number;
  /** The sum of what was actually charged, in cents. Never a count times a price. */
  lifetimeRevenueCents: number;

  /** paidOrganizations / organizationsCreated, as a fraction. Null when there are none. */
  conversionRate: number | null;

  /** Reported separately, never mixed into the numbers above. */
  demoOrganizations: number;
};

export async function allTimeMetrics(): Promise<AllTimeMetrics> {
  const [
    accountsCreated,
    organizationsCreated,
    tripsStarted,
    freeSetupOrganizations,
    manualLifetimeOrganizations,
    totalAttendees,
    signedWaivers,
    demoOrganizations,
    purchases,
    payingOrgs,
  ] = await Promise.all([
    prisma.user.count({ where: REAL_USER }),
    prisma.organization.count({ where: REAL_ORG }),
    prisma.trip.count({ where: REAL_TRIP }),
    prisma.organization.count({ where: { ...REAL_ORG, entitlement: "FREE_SETUP" } }),
    prisma.organization.count({ where: { ...REAL_ORG, entitlement: "MANUAL_LIFETIME" } }),
    prisma.attendee.count({ where: REAL_ATTENDEE }),
    prisma.signedWaiver.count({ where: { attendee: REAL_ATTENDEE } }),
    prisma.organization.count({ where: { isDemo: true } }),

    // Revenue is summed from what was actually charged, so a launch price, a
    // later price rise, and anything in between all total correctly.
    prisma.purchase.aggregate({
      where: REAL_STRIPE_PURCHASE,
      _count: { _all: true },
      _sum: { amountCents: true },
    }),

    // Distinct organizations, not purchases: one church that somehow paid twice
    // is one conversion.
    prisma.organization.findMany({
      where: { ...REAL_ORG, purchases: { some: { source: "STRIPE_CHECKOUT" } } },
      select: { id: true },
    }),
  ]);

  const paidOrganizations = payingOrgs.length;

  return {
    accountsCreated,
    organizationsCreated,
    tripsStarted,
    paidOrganizations,
    freeSetupOrganizations,
    manualLifetimeOrganizations,
    totalAttendees,
    signedWaivers,
    lifetimePurchases: purchases._count._all,
    lifetimeRevenueCents: purchases._sum.amountCents ?? 0,
    conversionRate: organizationsCreated > 0 ? paidOrganizations / organizationsCreated : null,
    demoOrganizations,
  };
}

// ---------------------------------------------------------------------------
// Recent windows
// ---------------------------------------------------------------------------

export type WindowMetrics = {
  label: string;
  days: number;
  accountsCreated: number;
  organizationsCreated: number;
  tripsStarted: number;
  lifetimePurchases: number;
  revenueCents: number;
};

/** A rolling window ending now — "last 7 days", not "this calendar week". */
export async function windowMetrics(label: string, days: number): Promise<WindowMetrics> {
  const from = since(days);
  const [accountsCreated, organizationsCreated, tripsStarted, purchases] = await Promise.all([
    prisma.user.count({ where: { ...REAL_USER, createdAt: { gte: from } } }),
    prisma.organization.count({ where: { ...REAL_ORG, createdAt: { gte: from } } }),
    prisma.trip.count({ where: { ...REAL_TRIP, createdAt: { gte: from } } }),
    prisma.purchase.aggregate({
      where: { ...REAL_STRIPE_PURCHASE, purchasedAt: { gte: from } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    label,
    days,
    accountsCreated,
    organizationsCreated,
    tripsStarted,
    lifetimePurchases: purchases._count._all,
    revenueCents: purchases._sum.amountCents ?? 0,
  };
}

export async function recentWindows(): Promise<WindowMetrics[]> {
  return Promise.all([
    windowMetrics("Last 24 hours", 1),
    windowMetrics("Last 7 days", 7),
    windowMetrics("Last 30 days", 30),
  ]);
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export type ActivityKind =
  | "account"
  | "organization"
  | "trip"
  | "purchase"
  | "manual-grant";

export type ActivityEntry = {
  at: Date;
  kind: ActivityKind;
  /** What happened, in a few words. */
  title: string;
  /** Who or which church, where naming one is appropriate. */
  subject: string;
  /** Only ever an amount of money. */
  detail?: string;
};

/**
 * The last few things that happened, across real churches only.
 *
 * Names, emails and amounts — never an attendee, a medical note, an emergency
 * contact, a waiver answer or a token. This is a business feed, not a window
 * into a church's data.
 */
export async function recentActivity(limit = 12): Promise<ActivityEntry[]> {
  const [accounts, organizations, trips, purchases] = await Promise.all([
    prisma.user.findMany({
      where: REAL_USER,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { createdAt: true, email: true, firstName: true, lastName: true },
    }),
    prisma.organization.findMany({
      where: REAL_ORG,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { createdAt: true, name: true },
    }),
    prisma.trip.findMany({
      where: REAL_TRIP,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { createdAt: true, name: true, organization: { select: { name: true } } },
    }),
    prisma.purchase.findMany({
      where: { organization: REAL_ORG },
      orderBy: { purchasedAt: "desc" },
      take: limit,
      select: {
        purchasedAt: true,
        source: true,
        amountCents: true,
        organization: { select: { name: true } },
      },
    }),
  ]);

  const entries: ActivityEntry[] = [
    ...accounts.map((a) => ({
      at: a.createdAt,
      kind: "account" as const,
      title: "New account",
      subject: `${a.firstName} ${a.lastName}`.trim() || a.email,
      detail: a.email,
    })),
    ...organizations.map((o) => ({
      at: o.createdAt,
      kind: "organization" as const,
      title: "New organization",
      subject: o.name,
    })),
    ...trips.map((t) => ({
      at: t.createdAt,
      kind: "trip" as const,
      title: "Trip started",
      subject: t.name,
      detail: t.organization.name,
    })),
    ...purchases.map((p) => ({
      at: p.purchasedAt,
      kind: p.source === "STRIPE_CHECKOUT" ? ("purchase" as const) : ("manual-grant" as const),
      title: p.source === "STRIPE_CHECKOUT" ? "Lifetime purchase" : "Manual lifetime grant",
      subject: p.organization.name,
      detail: p.source === "STRIPE_CHECKOUT" ? formatCents(p.amountCents) : "granted",
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const METRIC_FILTERS = { REAL_ORG, REAL_TRIP, REAL_ATTENDEE, REAL_USER, REAL_STRIPE_PURCHASE };
