import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";

/**
 * Leader invitation lifecycle. Same token discipline as waiver signing links:
 * 256 bits of entropy, stored only as a hash, single use, expiring, revocable.
 *
 * Lives outside the server-action layer so the expiry, revocation and
 * single-use guarantees can be tested directly against the database.
 */
export const INVITE_TTL_DAYS = 14;

export type InviteFailure = "invalid" | "expired" | "used" | "revoked";

/** Creates an invitation, replacing any live one for the same address. */
export async function createInvitation(params: {
  organizationId: string;
  email: string;
  invitedByUserId: string;
}): Promise<string> {
  const email = params.email.trim().toLowerCase();
  const token = generateToken(32);

  await prisma.$transaction([
    prisma.organizationInvitation.updateMany({
      where: {
        organizationId: params.organizationId,
        emailNormalized: email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.organizationInvitation.create({
      data: {
        organizationId: params.organizationId,
        email,
        emailNormalized: email,
        role: "LEADER",
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        invitedByUserId: params.invitedByUserId,
      },
    }),
  ]);

  return token;
}

export type InvitationLookup =
  | {
      valid: true;
      id: string;
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
      email: string;
      invitedByUserId: string;
    }
  | { valid: false; reason: InviteFailure };

export async function findValidInvitation(token: string): Promise<InvitationLookup> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    return { valid: false, reason: "invalid" };
  }

  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organizationId: true,
      invitedByUserId: true,
      organization: { select: { name: true, slug: true } },
    },
  });

  if (!invitation) return { valid: false, reason: "invalid" };
  if (invitation.revokedAt) return { valid: false, reason: "revoked" };
  if (invitation.acceptedAt) return { valid: false, reason: "used" };
  if (invitation.expiresAt.getTime() < Date.now()) return { valid: false, reason: "expired" };

  return {
    valid: true,
    id: invitation.id,
    organizationId: invitation.organizationId,
    organizationName: invitation.organization.name,
    organizationSlug: invitation.organization.slug,
    email: invitation.email,
    invitedByUserId: invitation.invitedByUserId,
  };
}

export type AcceptOutcome =
  | { ok: true; organizationSlug: string }
  | { ok: false; reason: InviteFailure };

/** Consumes the invitation and adds the user as a LEADER. */
export async function acceptInvitation(token: string, userId: string): Promise<AcceptOutcome> {
  const lookup = await findValidInvitation(token);
  if (!lookup.valid) return { ok: false, reason: lookup.reason };

  // Claim first: the where-clause re-checks acceptedAt, so a double tap cannot
  // consume one invitation twice.
  const claimed = await prisma.organizationInvitation.updateMany({
    where: { id: lookup.id, acceptedAt: null, revokedAt: null },
    data: { acceptedAt: new Date(), acceptedByUserId: userId },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: lookup.organizationId, userId } },
    create: { organizationId: lookup.organizationId, userId, role: "LEADER" },
    update: {},
  });

  return { ok: true, organizationSlug: lookup.organizationSlug };
}

export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
): Promise<boolean> {
  const updated = await prisma.organizationInvitation.updateMany({
    where: { id: invitationId, organizationId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count > 0;
}
