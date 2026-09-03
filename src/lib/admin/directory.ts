import "server-only";
import { prisma } from "@/lib/db";
import type { Entitlement, Prisma } from "@prisma/client";

/**
 * The organization, account and purchase listings behind /admin.
 *
 * Every query here selects a fixed set of columns rather than whole rows. That
 * is the boundary: a platform admin is looking at how the business is doing,
 * not through a church's data. Nothing in this file can return a medical note,
 * an allergy, a medication, an emergency contact, a waiver answer, a signature,
 * a password hash, or any token — those columns are never named.
 *
 * "Last activity" means the most recent of the organization's own `updatedAt`
 * and its trips' `updatedAt`. It is derived from timestamps the app already
 * keeps rather than from a new tracking system, so it answers "when was this
 * church last touched?" and not "who clicked what". For an account it is the
 * last successful sign-in.
 */

export type OrgFilter = "all" | Entitlement;
export type OrgSort = "created" | "trips" | "attendees" | "activity";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  entitlement: Entitlement;
  isDemo: boolean;
  ownerEmail: string | null;
  trips: number;
  attendees: number;
  signedWaivers: number;
  createdAt: Date;
  lastActivity: Date;
};

const PAGE_SIZE = 50;

export async function listOrganizations(options: {
  search?: string;
  filter?: OrgFilter;
  sort?: OrgSort;
}): Promise<OrgRow[]> {
  const search = options.search?.trim() ?? "";
  const where: Prisma.OrganizationWhereInput = {};

  if (options.filter && options.filter !== "all") {
    where.entitlement = options.filter;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { members: { some: { user: { email: { contains: search, mode: "insensitive" } } } } },
    ];
  }

  const rows = await prisma.organization.findMany({
    where,
    take: PAGE_SIZE,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      entitlement: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      members: {
        where: { role: "OWNER" },
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { user: { select: { email: true } } },
      },
      trips: { select: { id: true, updatedAt: true } },
      _count: { select: { trips: true } },
    },
  });

  const attendeeCounts = await prisma.attendee.groupBy({
    by: ["tripId"],
    where: { tripId: { in: rows.flatMap((r) => r.trips.map((t) => t.id)) } },
    _count: { _all: true },
  });
  const perTrip = new Map(attendeeCounts.map((c) => [c.tripId, c._count._all]));

  const waiverCounts = await prisma.signedWaiver.groupBy({
    by: ["attendeeId"],
    where: { attendee: { tripId: { in: rows.flatMap((r) => r.trips.map((t) => t.id)) } } },
    _count: { _all: true },
  });
  const signedByAttendee = new Map(waiverCounts.map((c) => [c.attendeeId, c._count._all]));
  const attendeeTrip = new Map(
    (
      await prisma.attendee.findMany({
        where: { id: { in: [...signedByAttendee.keys()] } },
        select: { id: true, tripId: true },
      })
    ).map((a) => [a.id, a.tripId]),
  );
  const signedPerTrip = new Map<string, number>();
  for (const [attendeeId, count] of signedByAttendee) {
    const tripId = attendeeTrip.get(attendeeId);
    if (tripId) signedPerTrip.set(tripId, (signedPerTrip.get(tripId) ?? 0) + count);
  }

  const mapped: OrgRow[] = rows.map((row) => {
    const tripIds = row.trips.map((t) => t.id);
    const lastTripTouch = row.trips.reduce<number>(
      (latest, trip) => Math.max(latest, trip.updatedAt.getTime()),
      0,
    );
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      entitlement: row.entitlement,
      isDemo: row.isDemo,
      ownerEmail: row.members[0]?.user.email ?? null,
      trips: row._count.trips,
      attendees: tripIds.reduce((sum, id) => sum + (perTrip.get(id) ?? 0), 0),
      signedWaivers: tripIds.reduce((sum, id) => sum + (signedPerTrip.get(id) ?? 0), 0),
      createdAt: row.createdAt,
      lastActivity: new Date(Math.max(row.updatedAt.getTime(), lastTripTouch)),
    };
  });

  const sort = options.sort ?? "created";
  mapped.sort((a, b) => {
    switch (sort) {
      case "trips":
        return b.trips - a.trips;
      case "attendees":
        return b.attendees - a.attendees;
      case "activity":
        return b.lastActivity.getTime() - a.lastActivity.getTime();
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  return mapped;
}

export type OrgDetail = OrgRow & {
  members: Array<{ name: string; email: string; role: string; joined: Date }>;
  purchases: Array<{
    at: Date;
    source: "STRIPE_CHECKOUT" | "MANUAL_GRANT";
    amountCents: number;
    currency: string;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    grantReason: string | null;
  }>;
};

export async function organizationDetail(id: string): Promise<OrgDetail | null> {
  const [row] = await listOrganizationsById(id);
  if (!row) return null;

  const [members, purchases] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        role: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { organizationId: id },
      orderBy: { purchasedAt: "desc" },
      select: {
        purchasedAt: true,
        source: true,
        amountCents: true,
        currency: true,
        // Safe references for support. Never a secret key, never card data.
        stripeCheckoutSessionId: true,
        stripePaymentIntentId: true,
        grantReason: true,
      },
    }),
  ]);

  return {
    ...row,
    members: members.map((m) => ({
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      email: m.user.email,
      role: m.role,
      joined: m.createdAt,
    })),
    purchases: purchases.map((p) => ({
      at: p.purchasedAt,
      source: p.source,
      amountCents: p.amountCents,
      currency: p.currency,
      checkoutSessionId: p.stripeCheckoutSessionId,
      paymentIntentId: p.stripePaymentIntentId,
      grantReason: p.grantReason,
    })),
  };
}

/** Reuses the list query for one organization, so the columns can never drift. */
async function listOrganizationsById(id: string): Promise<OrgRow[]> {
  const org = await prisma.organization.findUnique({ where: { id }, select: { slug: true } });
  if (!org) return [];
  const rows = await listOrganizations({ search: org.slug, filter: "all" });
  return rows.filter((row) => row.id === id);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  platformRole: "USER" | "PLATFORM_ADMIN";
  organizations: Array<{ name: string; role: string; isDemo: boolean }>;
  lastActivity: Date | null;
};

export async function listAccounts(search?: string): Promise<AccountRow[]> {
  const term = search?.trim() ?? "";
  const where: Prisma.UserWhereInput = term
    ? {
        OR: [
          { email: { contains: term, mode: "insensitive" } },
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
        ],
      }
    : {};

  const rows = await prisma.user.findMany({
    where,
    take: PAGE_SIZE,
    orderBy: { createdAt: "desc" },
    // Named columns only: passwordHash and every token relation are absent by
    // construction rather than by being filtered out later.
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      platformRole: true,
      lastSignInAt: true,
      memberships: {
        select: {
          role: true,
          organization: { select: { name: true, isDemo: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    createdAt: row.createdAt,
    platformRole: row.platformRole,
    organizations: row.memberships.map((m) => ({
      name: m.organization.name,
      role: m.role,
      isDemo: m.organization.isDemo,
    })),
    lastActivity: row.lastSignInAt,
  }));
}

export async function accountDetail(id: string): Promise<AccountRow | null> {
  const rows = await listAccounts();
  const found = rows.find((row) => row.id === id);
  if (found) return found;

  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      platformRole: true,
      lastSignInAt: true,
      memberships: {
        select: { role: true, organization: { select: { name: true, isDemo: true } } },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    createdAt: row.createdAt,
    platformRole: row.platformRole,
    organizations: row.memberships.map((m) => ({
      name: m.organization.name,
      role: m.role,
      isDemo: m.organization.isDemo,
    })),
    lastActivity: row.lastSignInAt,
  };
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export type PurchaseRow = {
  id: string;
  organizationName: string;
  organizationId: string;
  isDemo: boolean;
  ownerEmail: string | null;
  at: Date;
  source: "STRIPE_CHECKOUT" | "MANUAL_GRANT";
  amountCents: number;
  currency: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  grantReason: string | null;
};

export async function listPurchases(): Promise<PurchaseRow[]> {
  const rows = await prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    take: 200,
    select: {
      id: true,
      purchasedAt: true,
      source: true,
      amountCents: true,
      currency: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      grantReason: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          isDemo: true,
          members: {
            where: { role: "OWNER" },
            take: 1,
            orderBy: { createdAt: "asc" },
            select: { user: { select: { email: true } } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    isDemo: row.organization.isDemo,
    ownerEmail: row.organization.members[0]?.user.email ?? null,
    at: row.purchasedAt,
    source: row.source,
    amountCents: row.amountCents,
    currency: row.currency,
    checkoutSessionId: row.stripeCheckoutSessionId,
    paymentIntentId: row.stripePaymentIntentId,
    grantReason: row.grantReason,
  }));
}
