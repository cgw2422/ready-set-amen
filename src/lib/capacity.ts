import "server-only";
import type { Entitlement } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAddAttendee, canCreateTrip, hasFullAccess, type Decision } from "@/lib/entitlement";

/**
 * Enforcing a counted limit, safely.
 *
 * Counting free capacity and then writing is a race: two requests can both read
 * "nine people" and each add one. Every counted limit is therefore checked while
 * holding a Postgres advisory lock keyed on the organization, taken for the life
 * of the surrounding transaction, so the second request waits and then sees the
 * first one's row.
 *
 * This layer deliberately knows nothing about redirects or HTTP — it returns a
 * decision. `src/lib/access.ts` turns a refusal into the unlock screen, which
 * keeps the transactional part testable on its own and stops Next's routing
 * from being dragged into a database concern.
 */

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type CapacityResult<T> = { ok: true; value: T } | { ok: false; decision: Decision };

type Org = { id: string; entitlement: Entitlement };

async function withOrgLock<T>(organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Advisory rather than a row lock: it serialises the *decision* for this
    // organization without blocking ordinary reads of its rows, and it releases
    // itself when the transaction ends however that happens.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    return work(tx);
  });
}

/** Free setup includes one trip. Checked and created under the same lock. */
export async function createUnderTripCapacity<T>(
  organization: Org,
  create: (tx: Tx) => Promise<T>,
): Promise<CapacityResult<T>> {
  if (hasFullAccess(organization)) {
    return { ok: true, value: await prisma.$transaction((tx) => create(tx)) };
  }

  return withOrgLock(organization.id, async (tx) => {
    const trips = await tx.trip.count({ where: { organizationId: organization.id } });
    const decision = canCreateTrip(organization, trips);
    if (!decision.allowed) return { ok: false as const, decision };
    return { ok: true as const, value: await create(tx) };
  });
}

/**
 * Free setup includes ten people, counted across the organization and applied
 * the same way however they are entered — one at a time, bulk pasted, or
 * imported from a spreadsheet. A batch that would exceed the limit is refused
 * before anything is written rather than half-applied.
 */
export async function createUnderAttendeeCapacity<T>(
  organization: Org,
  adding: number,
  create: (tx: Tx) => Promise<T>,
): Promise<CapacityResult<T>> {
  if (hasFullAccess(organization)) {
    return { ok: true, value: await prisma.$transaction((tx) => create(tx)) };
  }

  return withOrgLock(organization.id, async (tx) => {
    const existing = await tx.attendee.count({
      where: { trip: { organizationId: organization.id } },
    });
    const decision = canAddAttendee(organization, existing, adding);
    if (!decision.allowed) return { ok: false as const, decision };
    return { ok: true as const, value: await create(tx) };
  });
}

/** Read-only counts, for showing a number rather than deciding a write. */
export async function countTrips(organizationId: string): Promise<number> {
  return prisma.trip.count({ where: { organizationId } });
}

export async function countAttendees(organizationId: string): Promise<number> {
  return prisma.attendee.count({ where: { trip: { organizationId } } });
}
