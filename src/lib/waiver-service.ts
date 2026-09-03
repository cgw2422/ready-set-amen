import "server-only";

import { prisma } from "@/lib/db";
import { hasFullAccess } from "@/lib/entitlement";
import { generateToken, hashDocument, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/request";
import {
  ELECTRONIC_CONSENT_TEXT,
  MEDICAL_FIELD_KEYS,
  waiverContentSchema,
  type WaiverContent,
} from "@/lib/waiver-content";
import type { SignerRole } from "@prisma/client";

/** How long a signing link stays usable when the trip has no end date. */
const DEFAULT_LINK_DAYS = 90;
const POST_TRIP_GRACE_DAYS = 30;

/**
 * Ensures every attendee on the trip has a recipient row for each waiver
 * requirement that applies to everyone. Idempotent: existing rows — including
 * anything a leader marked NOT_REQUIRED — are left untouched.
 */
export async function syncWaiverRecipients(tripId: string): Promise<number> {
  const requirements = await prisma.tripWaiverRequirement.findMany({
    where: { tripId, appliesToAll: true },
    select: { id: true },
  });
  if (requirements.length === 0) return 0;

  const attendees = await prisma.attendee.findMany({
    where: { tripId },
    select: { id: true, isMinor: true },
  });

  let created = 0;
  for (const requirement of requirements) {
    const existing = await prisma.waiverRecipient.findMany({
      where: { requirementId: requirement.id },
      select: { attendeeId: true },
    });
    const have = new Set(existing.map((r) => r.attendeeId));
    const missing = attendees.filter((a) => !have.has(a.id));
    if (missing.length === 0) continue;

    const result = await prisma.waiverRecipient.createMany({
      data: missing.map((a) => ({
        requirementId: requirement.id,
        attendeeId: a.id,
        signerRole: (a.isMinor ? "GUARDIAN" : "SELF") as SignerRole,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

function linkExpiry(tripEnd: Date | null): Date {
  const base = tripEnd
    ? new Date(tripEnd.getTime() + POST_TRIP_GRACE_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + DEFAULT_LINK_DAYS * 24 * 60 * 60 * 1000);
  // Never issue a link that is already expired for a trip in the past.
  const minimum = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return base > minimum ? base : minimum;
}

/**
 * Issues a fresh signing link and revokes any previous live link for the same
 * recipient, so a link shared into the wrong group chat stops working the
 * moment a leader regenerates it.
 */
export async function issueSigningLink(recipientId: string, createdBy?: string): Promise<string> {
  const recipient = await prisma.waiverRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    select: {
      id: true,
      requirement: {
        select: {
          trip: { select: { endDate: true, organization: { select: { entitlement: true } } } },
        },
      },
    },
  });

  // The last line of defence, inside the service that mints the token rather
  // than only in the actions that call it. Creating and previewing a waiver is
  // free; a token a parent could actually use is not, and no future caller
  // should be able to reach one by forgetting a check of its own.
  if (!hasFullAccess(recipient.requirement.trip.organization)) {
    throw new Error("Unlock Ready Set Amen to send signing links.");
  }

  const token = generateToken(32);

  await prisma.$transaction([
    prisma.waiverSigningLink.updateMany({
      where: { recipientId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.waiverSigningLink.create({
      data: {
        recipientId: recipient.id,
        tokenHash: sha256(token),
        // A short, non-secret prefix so a leader can tell two links apart in
        // the UI without the app ever storing the token itself.
        tokenPrefix: token.slice(0, 6),
        expiresAt: linkExpiry(recipient.requirement.trip.endDate),
        createdBy,
      },
    }),
    prisma.waiverRecipient.update({
      where: { id: recipientId },
      data: { status: "SENT", sentAt: new Date() },
    }),
  ]);

  return signingUrl(token);
}

export function signingUrl(token: string): string {
  return `${appUrl()}/sign/${token}`;
}

export type SigningContext = {
  linkId: string;
  recipientId: string;
  status: string;
  signerRole: SignerRole;
  content: WaiverContent;
  versionId: string;
  attendee: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    dateOfBirth: Date | null;
    isMinor: boolean;
  };
  guardian: { name: string; email: string | null; phone: string | null } | null;
  trip: { id: string; name: string; startDate: Date | null; endDate: Date | null };
  organizationName: string;
  alreadySigned: boolean;
};

/**
 * Resolves a raw signing token. Returns null for every failure mode — invalid,
 * expired, revoked, used — so the public page can render one identical message
 * and never confirm whether a token exists (docs/ARCHITECTURE.md §4.2).
 */
export async function resolveSigningToken(token: string): Promise<SigningContext | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;

  const link = await prisma.waiverSigningLink.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      usedAt: true,
      useCount: true,
      maxUses: true,
      recipient: {
        select: {
          id: true,
          status: true,
          signerRole: true,
          signedWaiver: { select: { id: true } },
          attendee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              dateOfBirth: true,
              isMinor: true,
              guardians: {
                where: { isPrimary: true },
                select: { name: true, email: true, phone: true },
                take: 1,
              },
            },
          },
          requirement: {
            select: {
              versionId: true,
              version: { select: { content: true } },
              trip: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
                  organization: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt.getTime() < Date.now()) return null;
  if (link.usedAt || link.useCount >= link.maxUses) return null;

  const parsed = waiverContentSchema.safeParse(link.recipient.requirement.version.content);
  if (!parsed.success) return null;

  const guardian = link.recipient.attendee.guardians[0] ?? null;

  return {
    linkId: link.id,
    recipientId: link.recipient.id,
    status: link.recipient.status,
    signerRole: link.recipient.signerRole,
    content: parsed.data,
    versionId: link.recipient.requirement.versionId,
    attendee: {
      id: link.recipient.attendee.id,
      firstName: link.recipient.attendee.firstName,
      lastName: link.recipient.attendee.lastName,
      preferredName: link.recipient.attendee.preferredName,
      dateOfBirth: link.recipient.attendee.dateOfBirth,
      isMinor: link.recipient.attendee.isMinor,
    },
    guardian: guardian
      ? { name: guardian.name, email: guardian.email, phone: guardian.phone }
      : null,
    trip: link.recipient.requirement.trip,
    organizationName: link.recipient.requirement.trip.organization.name,
    alreadySigned: Boolean(link.recipient.signedWaiver),
  };
}

/** Records that the signer opened the link. Never fails the request. */
export async function markSigningLinkViewed(linkId: string, recipientId: string): Promise<void> {
  const now = new Date();
  await prisma
    .$transaction([
      prisma.waiverSigningLink.updateMany({
        where: { id: linkId, viewedAt: null },
        data: { viewedAt: now },
      }),
      prisma.waiverRecipient.updateMany({
        where: { id: recipientId, status: { in: ["NOT_SENT", "SENT"] } },
        data: { status: "VIEWED", viewedAt: now },
      }),
    ])
    .catch(() => undefined);
}

export type SignatureSubmission = {
  token: string;
  signerName: string;
  signerRelationship: string;
  signerEmail: string | null;
  signerPhone: string | null;
  typedSignature: string;
  drawnSignature: string | null;
  consentToElectronicRecords: boolean;
  acknowledgements: { key: string; label: string; checked: boolean }[];
  responses: { key: string; label: string; value: string }[];
  ipAddress: string | null;
  userAgent: string | null;
};

export type SignatureResult =
  | {
      ok: true;
      signedWaiverId: string;
      attendeeName: string;
      tripName: string;
      /** Other children of the same guardian who still need to sign. */
      siblings: { name: string; url: string }[];
    }
  | { ok: false; error: string };

/**
 * The signing transaction (docs/ARCHITECTURE.md §4.3).
 *
 * Everything is re-validated here — the client is never trusted — and the whole
 * thing is one transaction so there is no state where a recipient reads as
 * signed without a durable, immutable record behind it.
 */
export async function recordSignature(input: SignatureSubmission): Promise<SignatureResult> {
  const context = await resolveSigningToken(input.token);
  if (!context) return { ok: false, error: "This signing link is no longer available." };
  if (context.alreadySigned) {
    return { ok: false, error: "This waiver has already been signed." };
  }

  if (!input.consentToElectronicRecords) {
    return { ok: false, error: "Please agree to sign electronically to continue." };
  }
  if (input.typedSignature.trim().length < 2) {
    return { ok: false, error: "Please type your full legal name to sign." };
  }
  if (input.signerName.trim().length < 2) {
    return { ok: false, error: "Please enter the name of the person signing." };
  }
  if (context.content.requireDrawnSignature && !input.drawnSignature) {
    return { ok: false, error: "Please draw your signature to continue." };
  }

  // A guardian signing for a minor must identify themselves and their relationship.
  if (context.signerRole === "GUARDIAN") {
    if (!input.signerRelationship.trim()) {
      return { ok: false, error: "Please tell us your relationship to the participant." };
    }
  }

  // Every acknowledgement the template marks required must be checked.
  const checked = new Map(input.acknowledgements.map((a) => [a.key, a.checked]));
  for (const ack of context.content.acknowledgements) {
    if (ack.required && !checked.get(ack.key)) {
      return { ok: false, error: "Please check every required acknowledgement." };
    }
  }
  for (const initial of context.content.initials) {
    const value = input.responses.find((r) => r.key === initial.key)?.value?.trim();
    if (!value) return { ok: false, error: "Please add your initials where requested." };
  }

  // Required fields, validated against the template rather than the form.
  const answers = new Map(input.responses.map((r) => [r.key, r.value.trim()]));
  for (const field of context.content.fields) {
    if (!field.enabled || !field.required) continue;
    if (!answers.get(field.key)) {
      return { ok: false, error: `${field.label} is required.` };
    }
  }
  for (const question of context.content.customQuestions) {
    if (question.required && !answers.get(question.key)) {
      return { ok: false, error: `${question.label} is required.` };
    }
  }

  // Re-read the pinned version and verify its stored hash still matches its
  // content before anyone signs it.
  const version = await prisma.waiverTemplateVersion.findUniqueOrThrow({
    where: { id: context.versionId },
    select: { id: true, content: true, contentHash: true, versionNumber: true, templateId: true },
  });
  if (hashDocument(version.content) !== version.contentHash) {
    return { ok: false, error: "This document could not be verified. Please contact the organizer." };
  }

  const snapshot = {
    formatVersion: 1 as const,
    templateId: version.templateId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    content: version.content,
    capturedAt: new Date().toISOString(),
  };

  const participantName =
    answers.get("participantName")?.trim() ||
    `${context.attendee.firstName} ${context.attendee.lastName}`.trim();

  const responsesToStore = input.responses
    .filter((r) => r.value.trim().length > 0)
    .map((r) => ({ fieldKey: r.key, fieldLabel: r.label, value: r.value.trim().slice(0, 4000) }));

  try {
    const signedWaiver = await prisma.$transaction(async (tx) => {
      // Re-check the link inside the transaction so two taps on a slow phone
      // cannot produce two signatures.
      const claim = await tx.waiverSigningLink.updateMany({
        where: { id: context.linkId, usedAt: null, revokedAt: null },
        data: { usedAt: new Date(), useCount: { increment: 1 } },
      });
      if (claim.count === 0) throw new Error("LINK_ALREADY_USED");

      const created = await tx.signedWaiver.create({
        data: {
          recipientId: context.recipientId,
          attendeeId: context.attendee.id,
          versionId: version.id,
          documentSnapshot: snapshot,
          documentHash: hashDocument(snapshot),
          participantNameAtSigning: participantName.slice(0, 200),
          participantDateOfBirth: context.attendee.dateOfBirth,
          signerName: input.signerName.trim().slice(0, 200),
          signerRole: context.signerRole,
          signerRelationship:
            context.signerRole === "SELF"
              ? "Self"
              : input.signerRelationship.trim().slice(0, 80),
          signerEmail: input.signerEmail?.trim().toLowerCase().slice(0, 200) || null,
          signerPhone: input.signerPhone?.trim().slice(0, 40) || null,
          typedSignature: input.typedSignature.trim().slice(0, 200),
          drawnSignature: input.drawnSignature,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          consentToElectronicRecords: true,
          consentText: ELECTRONIC_CONSENT_TEXT,
          acknowledgements: input.acknowledgements,
          responses: { create: responsesToStore },
        },
        select: { id: true },
      });

      await tx.waiverRecipient.update({
        where: { id: context.recipientId },
        data: { status: "SIGNED", signedAt: new Date() },
      });

      // Copy back only what the leader has not already filled in, and only
      // fields that belong on the attendee record.
      const attendee = await tx.attendee.findUniqueOrThrow({
        where: { id: context.attendee.id },
      });
      const copyBack: Record<string, string> = {};
      const copyable: [string, keyof typeof attendee][] = [
        ["emergencyContactName", "emergencyContactName"],
        ["emergencyContactPhone", "emergencyContactPhone"],
        ["emergencyContactRelation", "emergencyContactRelation"],
        ["allergies", "allergies"],
        ["medicalConditions", "medicalConditions"],
        ["medications", "medications"],
        ["dietaryRestrictions", "dietaryRestrictions"],
        ["insuranceProvider", "insuranceProvider"],
        ["insurancePolicyNumber", "insurancePolicyNumber"],
        ["doctorName", "doctorName"],
        ["doctorPhone", "doctorPhone"],
        ["shirtSize", "shirtSize"],
      ];
      for (const [key, column] of copyable) {
        const value = answers.get(key);
        if (value && !attendee[column]) copyBack[column as string] = value.slice(0, 2000);
      }
      if (Object.keys(copyBack).length > 0) {
        await tx.attendee.update({ where: { id: attendee.id }, data: copyBack });
      }

      // Guardian details collected during signing belong on the guardian row.
      const guardianName = answers.get("guardianName") || (context.signerRole === "GUARDIAN" ? input.signerName : null);
      const guardianEmail = answers.get("guardianEmail") || input.signerEmail;
      const guardianPhone = answers.get("guardianPhone") || input.signerPhone;
      if (context.signerRole === "GUARDIAN" && (guardianName || guardianEmail || guardianPhone)) {
        const existing = await tx.guardian.findFirst({
          where: { attendeeId: attendee.id, isPrimary: true },
          select: { id: true, name: true, email: true, phone: true },
        });
        const data = {
          name: guardianName?.trim().slice(0, 120) || existing?.name || "Parent / Guardian",
          email: (guardianEmail ?? existing?.email)?.trim().toLowerCase().slice(0, 200) || null,
          emailNormalized:
            (guardianEmail ?? existing?.email)?.trim().toLowerCase().slice(0, 200) || null,
          phone: (guardianPhone ?? existing?.phone)?.trim().slice(0, 40) || null,
          relationship: input.signerRelationship.trim().slice(0, 80) || null,
          isPrimary: true,
        };
        if (existing) await tx.guardian.update({ where: { id: existing.id }, data });
        else await tx.guardian.create({ data: { ...data, attendeeId: attendee.id } });
      }

      return created;
    });

    // "One parent, several children" (docs/ARCHITECTURE.md §9).
    //
    // Sibling links are only offered when the email the signer just entered
    // matches the guardian email already on file for THIS participant. That
    // means a stolen link alone cannot be used to discover other families'
    // children — the holder would also have to know the exact address the
    // church already has on record.
    const siblings = await findSiblingLinks({
      tripId: context.trip.id,
      attendeeId: context.attendee.id,
      signerEmail: (answers.get("guardianEmail") || input.signerEmail || "").trim().toLowerCase(),
      createdBy: undefined,
    });

    return {
      ok: true,
      signedWaiverId: signedWaiver.id,
      attendeeName: participantName,
      tripName: context.trip.name,
      siblings,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "LINK_ALREADY_USED") {
      return { ok: false, error: "This waiver has already been signed." };
    }
    // Never log the submission itself — it contains medical answers.
    console.error("[waiver] signature transaction failed");
    return { ok: false, error: "We couldn't save that signature. Please try again." };
  }
}

/**
 * Issues signing links for a guardian's other unsigned children on the same
 * trip. Returns an empty list unless the supplied email matches the guardian
 * record already stored for the participant who just signed.
 */
async function findSiblingLinks(params: {
  tripId: string;
  attendeeId: string;
  signerEmail: string;
  createdBy?: string;
}): Promise<{ name: string; url: string }[]> {
  const { tripId, attendeeId, signerEmail } = params;
  if (!signerEmail) return [];

  const onFile = await prisma.guardian.findFirst({
    where: { attendeeId, emailNormalized: signerEmail },
    select: { id: true },
  });
  if (!onFile) return [];

  const siblings = await prisma.waiverRecipient.findMany({
    where: {
      requirement: { tripId },
      status: { in: ["NOT_SENT", "SENT", "VIEWED"] },
      attendee: {
        id: { not: attendeeId },
        guardians: { some: { emailNormalized: signerEmail } },
      },
    },
    select: {
      id: true,
      attendee: { select: { firstName: true, lastName: true, preferredName: true } },
    },
    take: 10,
  });

  const links: { name: string; url: string }[] = [];
  for (const sibling of siblings) {
    const url = await issueSigningLink(sibling.id, params.createdBy);
    links.push({
      name: `${sibling.attendee.preferredName || sibling.attendee.firstName} ${sibling.attendee.lastName}`.trim(),
      url,
    });
  }
  return links;
}

/** Field keys that should be hidden from general printouts. */
export function isMedicalField(key: string): boolean {
  return MEDICAL_FIELD_KEYS.includes(key);
}
