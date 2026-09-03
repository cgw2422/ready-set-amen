"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createWithTripCapacity, requireOrg, requireTrip } from "@/lib/access";
import { parseDateInput } from "@/lib/format";
import type { FormState } from "@/lib/actions/auth";
import { DEFAULT_TASKS } from "@/lib/trip-defaults";

const DEFAULT_DOCUMENTS = [
  "Insurance Card",
  "Conference Registration",
  "Medical Form",
  "Permission Slip",
];

const DEFAULT_LEADER_ROLES = [
  { role: "Trip Leader", required: true },
  { role: "Assistant Leader", required: false },
  { role: "Medication Coordinator", required: false },
  { role: "Headcount Leader", required: false },
  { role: "Emergency Contact Lead", required: false },
];

const tripSchema = z.object({
  name: z.string().trim().min(2, "Give the trip a name").max(140),
  destination: z.string().trim().max(160).optional(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  departureLocation: z.string().trim().max(200).optional(),
  costPerPerson: z.number().nonnegative().max(1_000_000).nullable(),
  depositAmount: z.number().nonnegative().max(1_000_000).nullable(),
});

function parseMoney(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const cleaned = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(cleaned) ? cleaned : null;
}

export async function createTripAction(
  orgSlug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrg(orgSlug);

  const parsed = tripSchema.safeParse({
    name: formData.get("name"),
    destination: formData.get("destination") ?? undefined,
    startDate: parseDateInput(formData.get("startDate")),
    endDate: parseDateInput(formData.get("endDate")),
    departureLocation: formData.get("departureLocation") ?? undefined,
    costPerPerson: parseMoney(formData.get("costPerPerson")),
    depositAmount: parseMoney(formData.get("depositAmount")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }
  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "The return date can't be before the departure date." };
  }

  // Free setup includes one trip. The count and the insert happen under one
  // lock, so a second trip is never created and then paywalled — and two
  // simultaneous requests cannot both see an empty organization.
  const trip = await createWithTripCapacity(
    ctx,
    (tx) =>
      tx.trip.create({
        data: {
          organizationId: ctx.organization.id,
          name: data.name,
          destination: data.destination || null,
          startDate: data.startDate,
          endDate: data.endDate,
          departureLocation: data.departureLocation || null,
          costPerPerson: data.costPerPerson,
          depositAmount: data.depositAmount,
          tasks: {
            create: DEFAULT_TASKS.map((task, index) => ({
              title: task.title,
              description: task.description,
              isPrayerStep: task.isPrayerStep ?? false,
              isDefault: true,
              sortOrder: index,
            })),
          },
          documentRequirements: {
            create: DEFAULT_DOCUMENTS.map((name, index) => ({
              name,
              required: false,
              sortOrder: index,
            })),
          },
          leaderAssignments: {
            create: DEFAULT_LEADER_ROLES.map((r, index) => ({
              role: r.role,
              required: r.required,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      }),
    `/orgs/${orgSlug}`,
  );

  redirect(`/orgs/${orgSlug}/trips/${trip.id}`);
}

const updateSchema = tripSchema.extend({
  description: z.string().trim().max(4000).optional(),
  depositDueDate: z.date().nullable(),
  finalPaymentDueDate: z.date().nullable(),
  status: z.enum(["PLANNING", "READY", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]),
});

export async function updateTripAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    destination: formData.get("destination") ?? undefined,
    description: formData.get("description") ?? undefined,
    startDate: parseDateInput(formData.get("startDate")),
    endDate: parseDateInput(formData.get("endDate")),
    departureLocation: formData.get("departureLocation") ?? undefined,
    costPerPerson: parseMoney(formData.get("costPerPerson")),
    depositAmount: parseMoney(formData.get("depositAmount")),
    depositDueDate: parseDateInput(formData.get("depositDueDate")),
    finalPaymentDueDate: parseDateInput(formData.get("finalPaymentDueDate")),
    status: formData.get("status") ?? "PLANNING",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }
  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "The return date can't be before the departure date." };
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      name: data.name,
      destination: data.destination || null,
      description: data.description || null,
      startDate: data.startDate,
      endDate: data.endDate,
      departureLocation: data.departureLocation || null,
      costPerPerson: data.costPerPerson,
      depositAmount: data.depositAmount,
      depositDueDate: data.depositDueDate,
      finalPaymentDueDate: data.finalPaymentDueDate,
      status: data.status,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}`);
  return { ok: true };
}

/**
 * Applies the trip's cost per person to attendees whose amount due is still
 * zero. Never lowers an amount a leader has already set by hand.
 */
export async function applyTripCostAction(tripId: string): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { costPerPerson: true },
  });
  if (!trip.costPerPerson)
    return { error: "Set a cost per person on the trip first." };

  // A scholarship or a waived fee is a decision someone already made. Sweeping
  // them into "set them all" would quietly bill the students a church chose to
  // cover, and nothing on screen would say it had happened.
  await prisma.attendee.updateMany({
    where: {
      tripId,
      amountDue: 0,
      paymentStatus: { notIn: ["SCHOLARSHIP", "WAIVED"] },
    },
    data: { amountDue: trip.costPerPerson },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/payments`);
  return { ok: true };
}

export async function deleteTripAction(
  tripId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireTrip(tripId);
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  // Deleting a trip destroys signed waivers and minors' medical records, so it
  // requires the trip name typed exactly. See docs/ARCHITECTURE.md §3.
  if (confirmation !== ctx.trip.name) {
    throw new Error("Type the trip name exactly to confirm deletion.");
  }

  await prisma.trip.delete({ where: { id: tripId } });
  redirect(`/orgs/${ctx.organization.slug}`);
}
