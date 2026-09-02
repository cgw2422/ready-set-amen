"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import type { DocumentStatusValue } from "@prisma/client";
import type { FormState } from "@/lib/actions/auth";

export async function createDocumentRequirementAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the requirement a name." };

  const count = await prisma.documentRequirement.count({ where: { tripId } });
  await prisma.documentRequirement.create({
    data: {
      tripId,
      name: name.slice(0, 120),
      description: String(formData.get("description") ?? "").trim().slice(0, 500) || null,
      required: formData.get("required") === "on",
      sortOrder: count,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/forms`);
  return { ok: true };
}

export async function toggleRequirementRequiredAction(requirementId: string): Promise<FormState> {
  const requirement = await prisma.documentRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { id: true, tripId: true, required: true },
  });
  const ctx = await requireTrip(requirement.tripId);

  await prisma.documentRequirement.update({
    where: { id: requirementId },
    data: { required: !requirement.required },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${requirement.tripId}/forms`);
  return { ok: true };
}

export async function deleteRequirementAction(requirementId: string): Promise<FormState> {
  const requirement = await prisma.documentRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(requirement.tripId);
  await prisma.documentRequirement.delete({ where: { id: requirementId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${requirement.tripId}/forms`);
  return { ok: true };
}

const CYCLE: Record<DocumentStatusValue, DocumentStatusValue> = {
  MISSING: "COMPLETE",
  COMPLETE: "NOT_REQUIRED",
  NOT_REQUIRED: "MISSING",
};

/** Tap a cell to cycle Missing → Complete → Not required. */
export async function cycleDocumentStatusAction(
  attendeeId: string,
  requirementId: string,
): Promise<FormState> {
  const requirement = await prisma.documentRequirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(requirement.tripId);

  const attendee = await prisma.attendee.findFirst({
    where: { id: attendeeId, tripId: requirement.tripId },
    select: { id: true },
  });
  if (!attendee) return { error: "That person isn't on this trip." };

  const existing = await prisma.attendeeDocumentStatus.findUnique({
    where: { attendeeId_requirementId: { attendeeId, requirementId } },
    select: { id: true, status: true },
  });

  const next = existing ? CYCLE[existing.status] : "COMPLETE";
  await prisma.attendeeDocumentStatus.upsert({
    where: { attendeeId_requirementId: { attendeeId, requirementId } },
    create: { attendeeId, requirementId, status: next },
    update: { status: next },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${requirement.tripId}/forms`);
  return { ok: true };
}
