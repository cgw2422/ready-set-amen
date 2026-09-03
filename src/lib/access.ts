import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Entitlement, OrgRole } from "@prisma/client";
import {
  FREE_SETUP_ATTENDEE_LIMIT,
  allows,
  isPaid,
  unlockPath,
  type PaidFeature,
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

export function canManageOrg(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function isOwner(role: OrgRole): boolean {
  return role === "OWNER";
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
 * The one gate for paid features. It redirects rather than returning a flag so
 * a caller cannot forget to check the answer, and it runs before any work, so
 * declining to pay never costs a leader the data they had already entered.
 */
export function requirePaidFeature(
  ctx: OrgContext,
  feature: PaidFeature,
  returnTo?: string,
): void {
  if (allows(ctx.organization.entitlement, feature)) return;
  redirect(unlockPath(ctx.organization.slug, feature, returnTo));
}

/**
 * Free setup covers a real but small group, so a leader can see the dashboard
 * fill in before paying. Counted across the organization rather than per trip:
 * the limit is "try it with your first handful of people", not "ten per trip
 * you remember to create".
 */
export async function requireAttendeeCapacity(
  ctx: OrgContext,
  adding: number,
  returnTo?: string,
): Promise<void> {
  if (isPaid(ctx.organization.entitlement)) return;
  const existing = await prisma.attendee.count({
    where: { trip: { organizationId: ctx.organization.id } },
  });
  if (existing + adding > FREE_SETUP_ATTENDEE_LIMIT) {
    redirect(unlockPath(ctx.organization.slug, "attendees-beyond-free-limit", returnTo));
  }
}
