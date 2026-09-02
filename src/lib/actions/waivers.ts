"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrg, requireOrgById, requireTrip } from "@/lib/access";
import { hashDocument } from "@/lib/crypto";
import { emptyContent, waiverContentSchema } from "@/lib/waiver-content";
import { issueSigningLink, syncWaiverRecipients } from "@/lib/waiver-service";
import { sendMail, waiverInviteMessage, mailEnabled } from "@/lib/mailer";
import { displayName } from "@/lib/format";
import type { FormState } from "@/lib/actions/auth";

export async function createWaiverTemplateAction(
  orgSlug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrg(orgSlug);

  // Server-side gate: a church cannot create its first waiver until an owner has
  // acknowledged that the language is theirs to get right.
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: { waiverTermsAcceptedAt: true },
  });
  if (!organization.waiverTermsAcceptedAt) {
    return {
      error:
        "Your organization owner needs to acknowledge the waiver responsibility notice before creating a waiver.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give this waiver a name you'll recognize later." };

  const title = String(formData.get("waiverTitle") ?? "").trim() || name;

  const content = emptyContent(ctx.organization.name, title);
  const template = await prisma.waiverTemplate.create({
    data: {
      organizationId: ctx.organization.id,
      name,
      versions: {
        create: {
          versionNumber: 1,
          content,
          contentHash: hashDocument(content),
          createdBy: ctx.userId,
        },
      },
    },
    select: { id: true },
  });

  redirect(`/orgs/${orgSlug}/waivers/${template.id}`);
}

/**
 * Saving always writes a NEW version. Versions are append-only so a signature
 * taken yesterday still points at exactly the words that were signed.
 */
export async function saveWaiverVersionAction(
  templateId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const template = await prisma.waiverTemplate.findUniqueOrThrow({
    where: { id: templateId },
    select: { id: true, organizationId: true },
  });
  const ctx = await requireOrgById(template.organizationId);

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("content") ?? ""));
  } catch {
    return { error: "We couldn't read that waiver. Please try again." };
  }

  const parsed = waiverContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the waiver content." };
  }
  const content = parsed.data;

  const enabledBody = Object.values(content.sections).some(
    (section) => section.enabled && section.body.trim().length > 0,
  );
  if (!enabledBody) {
    return { error: "Add your waiver language to at least one enabled section before saving." };
  }

  const hash = hashDocument(content);
  const latest = await prisma.waiverTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true, contentHash: true },
  });

  if (latest?.contentHash === hash) {
    // Nothing actually changed — don't create a version for a no-op save.
    const name = String(formData.get("name") ?? "").trim();
    if (name) await prisma.waiverTemplate.update({ where: { id: templateId }, data: { name } });
    revalidatePath(`/orgs/${ctx.organization.slug}/waivers/${templateId}`);
    return { ok: true };
  }

  await prisma.$transaction([
    prisma.waiverTemplateVersion.create({
      data: {
        templateId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        content,
        contentHash: hash,
        createdBy: ctx.userId,
      },
    }),
    prisma.waiverTemplate.update({
      where: { id: templateId },
      data: { name: String(formData.get("name") ?? "").trim() || undefined },
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/waivers/${templateId}`);
  return { ok: true };
}

export async function archiveWaiverTemplateAction(templateId: string): Promise<void> {
  const template = await prisma.waiverTemplate.findUniqueOrThrow({
    where: { id: templateId },
    select: { organizationId: true, archivedAt: true },
  });
  const ctx = await requireOrgById(template.organizationId);
  await prisma.waiverTemplate.update({
    where: { id: templateId },
    data: { archivedAt: template.archivedAt ? null : new Date() },
  });
  revalidatePath(`/orgs/${ctx.organization.slug}/waivers`);
}

const assignSchema = z.object({
  templateId: z.string().min(1, "Choose a waiver"),
  title: z.string().trim().max(200).optional(),
});

/** Attaches a specific waiver *version* to the trip and fans out recipients. */
export async function assignWaiverToTripAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  const parsed = assignSchema.safeParse({
    templateId: formData.get("templateId"),
    title: formData.get("title") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a waiver to use." };
  }

  const template = await prisma.waiverTemplate.findFirst({
    where: { id: parsed.data.templateId, organizationId: ctx.organization.id },
    select: {
      id: true,
      name: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true } },
    },
  });
  if (!template || template.versions.length === 0) {
    return { error: "That waiver isn't available. Try refreshing the page." };
  }

  const existing = await prisma.tripWaiverRequirement.findFirst({
    where: { tripId, version: { templateId: template.id } },
    select: { id: true },
  });
  if (existing) return { error: "That waiver is already assigned to this trip." };

  await prisma.tripWaiverRequirement.create({
    data: {
      tripId,
      versionId: template.versions[0].id,
      title: parsed.data.title?.trim() || template.name,
      appliesToAll: true,
    },
  });

  await syncWaiverRecipients(tripId);
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/waivers`);
  return { ok: true };
}

/**
 * Moves a trip onto the template's newest version. Already-signed recipients
 * keep their signature and their original document; only unsigned recipients
 * are asked for the new one.
 */
export async function adoptLatestVersionAction(requirementId: string): Promise<FormState> {
  const requirement = await prisma.tripWaiverRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: {
      id: true,
      tripId: true,
      versionId: true,
      version: { select: { templateId: true, versionNumber: true } },
    },
  });
  const ctx = await requireTrip(requirement.tripId);

  const latest = await prisma.waiverTemplateVersion.findFirst({
    where: { templateId: requirement.version.templateId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
  if (!latest || latest.id === requirement.versionId) {
    return { error: "This trip is already using the newest version." };
  }

  await prisma.$transaction([
    prisma.tripWaiverRequirement.update({
      where: { id: requirementId },
      data: { versionId: latest.id },
    }),
    // Any live link points at the old wording; revoke so nobody signs a
    // document the trip no longer uses.
    prisma.waiverSigningLink.updateMany({
      where: {
        recipient: { requirementId, status: { not: "SIGNED" } },
        revokedAt: null,
        usedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.waiverRecipient.updateMany({
      where: { requirementId, status: { in: ["SENT", "VIEWED"] } },
      data: { status: "NOT_SENT", sentAt: null, viewedAt: null },
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${requirement.tripId}/waivers`);
  return { ok: true };
}

export async function removeWaiverRequirementAction(requirementId: string): Promise<FormState> {
  const requirement = await prisma.tripWaiverRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { id: true, tripId: true, recipients: { where: { status: "SIGNED" }, take: 1 } },
  });
  const ctx = await requireTrip(requirement.tripId);

  if (requirement.recipients.length > 0) {
    return {
      error:
        "This waiver already has signatures. Removing it would delete signed records — archive the template instead.",
    };
  }

  await prisma.tripWaiverRequirement.delete({ where: { id: requirementId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${requirement.tripId}/waivers`);
  return { ok: true };
}

async function recipientTrip(recipientId: string) {
  const recipient = await prisma.waiverRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    select: { id: true, status: true, requirement: { select: { tripId: true } } },
  });
  const ctx = await requireTrip(recipient.requirement.tripId);
  return { recipient, ctx };
}

export type LinkResult = { name: string; url: string };

export async function generateSigningLinkAction(recipientId: string): Promise<LinkResult> {
  const { recipient, ctx } = await recipientTrip(recipientId);
  if (recipient.status === "SIGNED") throw new Error("That waiver is already signed.");

  const url = await issueSigningLink(recipientId, ctx.userId);
  const attendee = await prisma.waiverRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    select: { attendee: { select: { firstName: true, lastName: true, preferredName: true } } },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${recipient.requirement.tripId}/waivers`);
  return { name: displayName(attendee.attendee), url };
}

/** Bulk "Copy Signing Links" for everyone still outstanding. */
export async function generateLinksForUnsignedAction(
  tripId: string,
  recipientIds?: string[],
): Promise<LinkResult[]> {
  const ctx = await requireTrip(tripId);

  const recipients = await prisma.waiverRecipient.findMany({
    where: {
      requirement: { tripId },
      status: { in: ["NOT_SENT", "SENT", "VIEWED"] },
      ...(recipientIds && recipientIds.length > 0 ? { id: { in: recipientIds } } : {}),
    },
    select: {
      id: true,
      attendee: { select: { firstName: true, lastName: true, preferredName: true } },
    },
    orderBy: [{ attendee: { lastName: "asc" } }, { attendee: { firstName: "asc" } }],
  });

  const results: LinkResult[] = [];
  for (const recipient of recipients) {
    const url = await issueSigningLink(recipient.id, ctx.userId);
    results.push({ name: displayName(recipient.attendee), url });
  }

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/waivers`);
  return results;
}

export async function setWaiverNotRequiredAction(
  recipientId: string,
  notRequired: boolean,
): Promise<FormState> {
  const { recipient, ctx } = await recipientTrip(recipientId);
  if (recipient.status === "SIGNED") {
    return { error: "This waiver is already signed." };
  }

  await prisma.$transaction([
    prisma.waiverRecipient.update({
      where: { id: recipientId },
      data: { status: notRequired ? "NOT_REQUIRED" : "NOT_SENT" },
    }),
    prisma.waiverSigningLink.updateMany({
      where: { recipientId, revokedAt: null, usedAt: null },
      data: notRequired ? { revokedAt: new Date() } : {},
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${recipient.requirement.tripId}/waivers`);
  return { ok: true };
}

/**
 * Optional convenience. The product works entirely without email — this is a
 * shortcut, not a dependency (docs/ARCHITECTURE.md §2).
 */
export async function emailSigningLinkAction(recipientId: string): Promise<FormState> {
  if (!mailEnabled()) {
    return { error: "Email isn't set up for this app yet. Use Copy Link instead." };
  }
  const { recipient, ctx } = await recipientTrip(recipientId);

  const detail = await prisma.waiverRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    select: {
      signerRole: true,
      attendee: {
        select: {
          firstName: true,
          lastName: true,
          preferredName: true,
          email: true,
          guardians: { where: { isPrimary: true }, select: { email: true }, take: 1 },
        },
      },
      requirement: { select: { trip: { select: { name: true } } } },
    },
  });

  const to =
    detail.signerRole === "GUARDIAN"
      ? detail.attendee.guardians[0]?.email
      : detail.attendee.email;

  if (!to) {
    return {
      error:
        detail.signerRole === "GUARDIAN"
          ? "Add a parent or guardian email first, or use Copy Link."
          : "Add an email address for this attendee first, or use Copy Link.",
    };
  }

  const url = await issueSigningLink(recipientId, ctx.userId);
  const result = await sendMail(
    waiverInviteMessage({
      to,
      participantName: displayName(detail.attendee),
      isGuardian: detail.signerRole === "GUARDIAN",
      tripName: detail.requirement.trip.name,
      organizationName: ctx.organization.name,
      url,
    }),
  );

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${recipient.requirement.tripId}/waivers`);
  return result.sent ? { ok: true } : { error: result.reason ?? "That email didn't send." };
}
