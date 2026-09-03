import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Entitlement } from "@prisma/client";
import type { OrgRole } from "@prisma/client";
import { canManageOrg, isOwner } from "@/lib/roles";
import {
  countAttendees,
  countTrips,
  createUnderAttendeeCapacity,
  createUnderTripCapacity,
  type Tx,
} from "@/lib/capacity";
import {
  canCreateTrip,
  canCreateSigningLink,
  canGenerateTripPacket,
  canInviteLeader,
  canRunHeadcount,
  hasFullAccess,
  unlockPath,
  type Decision,
} from "@/lib/entitlement";

/**
 * Every authenticated read and write in the app goes through one of these.
 * There is deliberately no helper that loads a trip or an attendee by id
 * without resolving organization membership first (docs/ARCHITECTURE.md §5.2).
 *
 * `notFound()` rather than a 403 keeps the app from confirming that an id
 * belongs to some other organization.
 */

export type OrgContext = {
  userId: string;
  /** Entitlement travels with the resolved organization so a gate can never be
      answered from an id the caller supplied. */
  organization: { id: string; name: string; slug: string; entitlement: Entitlement };
  role: OrgRole;
};

export const requireOrg = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, organization: { slug } },
    include: { organization: { select: { id: true, name: true, slug: true, entitlement: true } } },
  });
  if (!membership) notFound();
  return {
    userId: user.id,
    organization: membership.organization,
    role: membership.role,
  };
});

export const requireOrgById = cache(async (organizationId: string): Promise<OrgContext> => {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, organizationId },
    include: { organization: { select: { id: true, name: true, slug: true, entitlement: true } } },
  });
  if (!membership) notFound();
  return {
    userId: user.id,
    organization: membership.organization,
    role: membership.role,
  };
});

export type TripContext = OrgContext & {
  trip: {
    id: string;
    name: string;
    organizationId: string;
  };
};

/** Resolves a trip only through the caller's organization membership. */
export const requireTrip = cache(async (tripId: string): Promise<TripContext> => {
  const user = await requireUser();
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, organization: { members: { some: { userId: user.id } } } },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          entitlement: true,
          members: { where: { userId: user.id }, select: { role: true } },
        },
      },
    },
  });
  if (!trip) notFound();
  return {
    userId: user.id,
    organization: {
      id: trip.organization.id,
      name: trip.organization.name,
      slug: trip.organization.slug,
      entitlement: trip.organization.entitlement,
    },
    role: trip.organization.members[0]?.role ?? "LEADER",
    trip: { id: trip.id, name: trip.name, organizationId: trip.organizationId },
  };
});

/** Resolves an attendee through its trip, which resolves through membership. */
export async function requireAttendee(attendeeId: string) {
  const user = await requireUser();
  const attendee = await prisma.attendee.findFirst({
    where: {
      id: attendeeId,
      trip: { organization: { members: { some: { userId: user.id } } } },
    },
  });
  if (!attendee) notFound();
  return attendee;
}

/**
 * Owner-only actions: managing leaders, ownership, the waiver acknowledgement,
 * and deleting the organization. Everything else about running trips is open to
 * any member — there is deliberately no permissions matrix
 * (docs/ARCHITECTURE.md §10).
 */
export async function requireOrgOwner(slug: string): Promise<OrgContext> {
  const ctx = await requireOrg(slug);
  if (!isOwner(ctx.role)) notFound();
  return ctx;
}

/**
 * The one place a paid boundary is enforced.
 *
 * It redirects rather than returning a flag, so a caller cannot forget to check
 * the answer, and every caller runs it before doing any work — declining to pay
 * never costs a leader data they had already entered. The decision itself comes
 * from `@/lib/entitlement`, which the UI reads too, so a hidden button and a
 * blocked action can never disagree.
 */
export function enforce(ctx: OrgContext, decision: Decision, returnTo?: string): void {
  if (decision.allowed) return;
  redirect(unlockPath(ctx.organization.slug, decision.gate, returnTo, decision.detail));
}

/** True when this organization has no limits. Read-only; never enforces. */
export function fullAccess(ctx: OrgContext): boolean {
  return hasFullAccess(ctx.organization);
}

/**
 * Free setup includes one trip, and the caller passes what it wants to create
 * so the check and the write happen under one lock — a second trip is never
 * created and then paywalled.
 */
export async function createWithTripCapacity<T>(
  ctx: OrgContext,
  create: (tx: Tx) => Promise<T>,
  returnTo?: string,
): Promise<T> {
  const result = await createUnderTripCapacity(ctx.organization, create);
  if (!result.ok) enforce(ctx, result.decision, returnTo);
  return (result as { value: T }).value;
}

/**
 * Free setup includes ten people, counted across the organization and applied
 * the same way however they are entered.
 */
export async function createWithAttendeeCapacity<T>(
  ctx: OrgContext,
  adding: number,
  create: (tx: Tx) => Promise<T>,
  returnTo?: string,
): Promise<T> {
  const result = await createUnderAttendeeCapacity(ctx.organization, adding, create);
  if (!result.ok) enforce(ctx, result.decision, returnTo);
  return (result as { value: T }).value;
}

/** Read-only capacity checks, for showing a number or gating a page render. */
export async function tripCapacity(ctx: OrgContext): Promise<Decision> {
  if (hasFullAccess(ctx.organization)) return { allowed: true };
  return canCreateTrip(ctx.organization, await countTrips(ctx.organization.id));
}

export async function attendeeCount(ctx: OrgContext): Promise<number> {
  return countAttendees(ctx.organization.id);
}

/** Page-level guard: sends someone to unlock instead of to a form that cannot save. */
export async function requireTripCapacity(ctx: OrgContext, returnTo?: string): Promise<void> {
  enforce(ctx, await tripCapacity(ctx), returnTo);
}

export function requireSigningLinks(ctx: OrgContext, returnTo?: string): void {
  enforce(ctx, canCreateSigningLink(ctx.organization), returnTo);
}

export function requireHeadcount(ctx: OrgContext, returnTo?: string): void {
  enforce(ctx, canRunHeadcount(ctx.organization), returnTo);
}

export function requireLeaderInvitations(ctx: OrgContext, returnTo?: string): void {
  enforce(ctx, canInviteLeader(ctx.organization), returnTo);
}

export function requireTripPacket(ctx: OrgContext, returnTo?: string): void {
  enforce(ctx, canGenerateTripPacket(ctx.organization), returnTo);
}

export { canManageOrg, isOwner };
