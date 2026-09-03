"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isOwner, requireOrg, requireOrgOwner, requireLeaderInvitations } from "@/lib/access";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  acceptInvitation as acceptInvitationRecord,
  createInvitation,
  findValidInvitation,
  revokeInvitation as revokeInvitationRecord,
} from "@/lib/member-service";
import { appUrl, clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { invitationMessage, mailEnabled, sendMail } from "@/lib/mailer";
import { issuePasswordResetToken } from "@/lib/actions/account";
import { WAIVER_TERMS_TEXT } from "@/lib/legal";
import type { FormState } from "@/lib/actions/auth";

export type InviteResult = FormState & { url?: string; emailed?: boolean };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
});

/**
 * Invites one leader. Returns the link so the owner can share it themselves —
 * "Copy Invite Link" is the path that always works, exactly like waiver links.
 */
export async function inviteLeaderAction(
  slug: string,
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const ctx = await requireOrgOwner(slug);
  requireLeaderInvitations(ctx, `/orgs/${slug}/settings`);

  const limit = await rateLimit(`invite:${ctx.organization.id}`, 40, 60 * 60_000);
  if (!limit.allowed) {
    return { error: "That's a lot of invitations at once. Please try again shortly." };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  const email = parsed.data.email;

  const alreadyMember = await prisma.organizationMember.findFirst({
    where: { organizationId: ctx.organization.id, user: { email } },
    select: { id: true },
  });
  if (alreadyMember) return { error: "That person is already on your team." };

  const token = await createInvitation({
    organizationId: ctx.organization.id,
    email,
    invitedByUserId: ctx.userId,
  });

  const url = `${appUrl()}/invite/${token}`;
  let emailed = false;

  if (mailEnabled()) {
    const inviter = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { firstName: true, lastName: true },
    });
    const result = await sendMail(
      invitationMessage({
        to: email,
        organizationName: ctx.organization.name,
        inviterName: `${inviter.firstName} ${inviter.lastName}`.trim(),
        url,
      }),
    );
    emailed = result.sent;
  }

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true, url, emailed };
}

export async function revokeInvitationAction(
  slug: string,
  invitationId: string,
): Promise<FormState> {
  const ctx = await requireOrgOwner(slug);
  const revoked = await revokeInvitationRecord(ctx.organization.id, invitationId);
  if (!revoked) return { error: "That invitation is no longer pending." };

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true };
}

/** Re-issues a link for a pending invitation, revoking the previous one. */
export async function regenerateInvitationAction(
  slug: string,
  invitationId: string,
): Promise<InviteResult> {
  const ctx = await requireOrgOwner(slug);
  requireLeaderInvitations(ctx, `/orgs/${slug}/settings`);
  const existing = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId: ctx.organization.id, acceptedAt: null },
    select: { email: true },
  });
  if (!existing) return { error: "That invitation is no longer pending." };

  await revokeInvitationRecord(ctx.organization.id, invitationId);
  const token = await createInvitation({
    organizationId: ctx.organization.id,
    email: existing.email,
    invitedByUserId: ctx.userId,
  });

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true, url: `${appUrl()}/invite/${token}` };
}

export async function removeMemberAction(slug: string, memberId: string): Promise<FormState> {
  const ctx = await requireOrgOwner(slug);

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: ctx.organization.id },
    select: { id: true, role: true, userId: true },
  });
  if (!member) return { error: "That person is no longer on your team." };
  if (isOwner(member.role)) {
    return { error: "The owner can't be removed. Transfer ownership first." };
  }

  await prisma.$transaction([
    prisma.organizationMember.delete({ where: { id: member.id } }),
    // Their sessions stay valid for other organizations, but access to this
    // one is resolved per request through membership, so it stops immediately.
  ]);

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true };
}

export async function transferOwnershipAction(
  slug: string,
  memberId: string,
): Promise<FormState> {
  const ctx = await requireOrgOwner(slug);

  const target = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: ctx.organization.id },
    select: { id: true, userId: true },
  });
  if (!target) return { error: "That person is no longer on your team." };
  if (target.userId === ctx.userId) return { error: "You already own this organization." };

  // Both moves in one transaction so the organization is never ownerless and
  // never has two owners.
  await prisma.$transaction([
    prisma.organizationMember.updateMany({
      where: { organizationId: ctx.organization.id, userId: ctx.userId },
      data: { role: "LEADER" },
    }),
    prisma.organizationMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
  ]);

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true };
}

/**
 * Owner-generated password reset link.
 *
 * This is the recovery path when no mail provider is configured: without it a
 * self-hosted church with a forgotten password has no way back in, and the
 * alternative — printing tokens to logs — is worse.
 */
export async function generateMemberResetLinkAction(
  slug: string,
  memberId: string,
): Promise<InviteResult> {
  const ctx = await requireOrgOwner(slug);
  const ip = await clientIp();

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: ctx.organization.id },
    select: { userId: true },
  });
  if (!member) return { error: "That person is no longer on your team." };

  const url = await issuePasswordResetToken(member.userId, ip === "unknown" ? null : ip);
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Accepting an invitation
// ---------------------------------------------------------------------------

export type InvitationPreview =
  | {
      valid: true;
      organizationName: string;
      email: string;
      invitedBy: string;
      alreadyMember: boolean;
      signedInAs: string | null;
    }
  | { valid: false };

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const invitation = await findValidInvitation(token);
  if (!invitation.valid) return { valid: false };

  const inviter = await prisma.user.findUnique({
    where: { id: invitation.invitedByUserId },
    select: { firstName: true, lastName: true },
  });
  const user = await getCurrentUser();
  const alreadyMember = user
    ? Boolean(
        await prisma.organizationMember.findFirst({
          where: { organizationId: invitation.organizationId, userId: user.id },
          select: { id: true },
        }),
      )
    : false;

  return {
    valid: true,
    organizationName: invitation.organizationName,
    email: invitation.email,
    invitedBy: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : "Your trip organizer",
    alreadyMember,
    signedInAs: user?.email ?? null,
  };
}

/** Consumes the invitation for the signed-in user. */
export async function acceptInvitationAction(token: string): Promise<FormState> {
  const user = await requireUser();

  const outcome = await acceptInvitationRecord(token, user.id);
  if (!outcome.ok) {
    return { error: "This invitation is no longer available. Ask for a new one." };
  }

  redirect(`/orgs/${outcome.organizationSlug}`);
}

// ---------------------------------------------------------------------------
// Waiver language acknowledgement
// ---------------------------------------------------------------------------

export async function acknowledgeWaiverTermsAction(slug: string): Promise<FormState> {
  const ctx = await requireOrgOwner(slug);

  await prisma.organization.updateMany({
    where: { id: ctx.organization.id, waiverTermsAcceptedAt: null },
    data: {
      waiverTermsAcceptedAt: new Date(),
      waiverTermsAcceptedBy: ctx.userId,
      // Store what was agreed to, so changing the wording later doesn't
      // retroactively rewrite what this church acknowledged.
      waiverTermsText: WAIVER_TERMS_TEXT,
    },
  });

  revalidatePath(`/orgs/${slug}/waivers`);
  return { ok: true };
}

export async function deleteOrganizationAction(slug: string, formData: FormData): Promise<void> {
  const ctx = await requireOrgOwner(slug);
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== ctx.organization.name) {
    throw new Error("Type the organization name exactly to confirm deletion.");
  }

  // Cascades through trips, attendees, medical records and signed waivers.
  await prisma.organization.delete({ where: { id: ctx.organization.id } });
  redirect("/orgs");
}

export async function orgRequiresWaiverAcknowledgement(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { waiverTermsAcceptedAt: true },
  });
  return org.waiverTermsAcceptedAt === null;
}

export async function currentOrgRole(slug: string) {
  const ctx = await requireOrg(slug);
  return ctx.role;
}
