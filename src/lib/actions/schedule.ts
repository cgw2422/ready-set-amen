"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { parseDateInput } from "@/lib/format";
import type { FormState } from "@/lib/actions/auth";

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const itinerarySchema = z.object({
  title: z.string().trim().min(1, "Give this stop a title").max(140),
  date: z.date({ message: "Pick a date" }),
  startTime: z.string().regex(timePattern).nullable(),
  endTime: z.string().regex(timePattern).nullable(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  responsibleAttendeeId: z.string().max(40).nullable(),
  notes: z.string().trim().max(1000).optional(),
});

function readItinerary(formData: FormData) {
  const start = String(formData.get("startTime") ?? "").trim();
  const end = String(formData.get("endTime") ?? "").trim();
  return itinerarySchema.safeParse({
    title: formData.get("title"),
    date: parseDateInput(formData.get("date")) ?? undefined,
    startTime: start || null,
    endTime: end || null,
    location: formData.get("location") ?? undefined,
    description: formData.get("description") ?? undefined,
    responsibleAttendeeId: String(formData.get("responsibleAttendeeId") ?? "") || null,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createItineraryItemAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const parsed = readItinerary(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await prisma.itineraryItem.create({
    data: {
      tripId,
      title: parsed.data.title,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      location: parsed.data.location?.trim() || null,
      description: parsed.data.description?.trim() || null,
      responsibleAttendeeId: parsed.data.responsibleAttendeeId,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/itinerary`);
  return { ok: true };
}

export async function updateItineraryItemAction(
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const item = await prisma.itineraryItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(item.tripId);

  const parsed = readItinerary(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      title: parsed.data.title,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      location: parsed.data.location?.trim() || null,
      description: parsed.data.description?.trim() || null,
      responsibleAttendeeId: parsed.data.responsibleAttendeeId,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${item.tripId}/itinerary`);
  return { ok: true };
}

export async function deleteItineraryItemAction(itemId: string): Promise<FormState> {
  const item = await prisma.itineraryItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(item.tripId);
  await prisma.itineraryItem.delete({ where: { id: itemId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${item.tripId}/itinerary`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) return { error: "Give the task a name." };

  // Keep the prayer step last no matter what gets added.
  const maxOrder = await prisma.task.aggregate({
    where: { tripId, isPrayerStep: false },
    _max: { sortOrder: true },
  });

  await prisma.task.create({
    data: {
      tripId,
      title: title.slice(0, 160),
      description: String(formData.get("description") ?? "").trim().slice(0, 1000) || null,
      dueDate: parseDateInput(formData.get("dueDate")),
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/tasks`);
  return { ok: true };
}

export async function setTaskStatusAction(
  taskId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE",
): Promise<FormState> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, tripId: true, isPrayerStep: true },
  });
  const ctx = await requireTrip(task.tripId);

  // The prayer step is completed from the prayer screen, deliberately — it is
  // not a checkbox you tick in passing (docs/ARCHITECTURE.md §8).
  if (task.isPrayerStep) {
    return { error: "Complete this step from the Prayer screen." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
      completedBy: status === "DONE" ? ctx.userId : null,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${task.tripId}/tasks`);
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${task.tripId}`);
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<FormState> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, tripId: true, isPrayerStep: true },
  });
  const ctx = await requireTrip(task.tripId);
  if (task.isPrayerStep) return { error: "Every trip keeps the Pray Over The Group step." };

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${task.tripId}/tasks`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Prayer
// ---------------------------------------------------------------------------

export async function addPrayerFocusAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2) return { error: "Add something to pray over." };

  const count = await prisma.prayerFocus.count({ where: { tripId } });
  await prisma.prayerFocus.create({
    data: { tripId, text: text.slice(0, 300), sortOrder: count },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/prayer`);
  return { ok: true };
}

export async function removePrayerFocusAction(focusId: string): Promise<FormState> {
  const focus = await prisma.prayerFocus.findUniqueOrThrow({
    where: { id: focusId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(focus.tripId);
  await prisma.prayerFocus.delete({ where: { id: focusId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${focus.tripId}/prayer`);
  return { ok: true };
}

/**
 * The final preparation step. Completing it marks both the trip and the
 * matching task, and is reversible — a leader can undo it if they marked it by
 * mistake. It never contributes to the readiness percentage.
 */
export async function setPrayerCompleteAction(
  tripId: string,
  complete: boolean,
  notes?: string,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  await prisma.$transaction([
    prisma.trip.update({
      where: { id: tripId },
      data: {
        prayerCompletedAt: complete ? new Date() : null,
        prayerCompletedBy: complete ? ctx.userId : null,
        prayerNotes: notes?.trim().slice(0, 2000) || undefined,
      },
    }),
    prisma.task.updateMany({
      where: { tripId, isPrayerStep: true },
      data: {
        status: complete ? "DONE" : "TODO",
        completedAt: complete ? new Date() : null,
        completedBy: complete ? ctx.userId : null,
      },
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/prayer`);
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Leader assignments
// ---------------------------------------------------------------------------

export async function saveLeaderAssignmentAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  if (role.length < 2) return { error: "Name the responsibility." };

  const attendeeId = String(formData.get("attendeeId") ?? "") || null;
  if (attendeeId) {
    const onTrip = await prisma.attendee.findFirst({
      where: { id: attendeeId, tripId },
      select: { id: true },
    });
    if (!onTrip) return { error: "That person isn't on this trip." };
  }

  const data = {
    role: role.slice(0, 80),
    attendeeId,
    personName: String(formData.get("personName") ?? "").trim().slice(0, 120) || null,
    personPhone: String(formData.get("personPhone") ?? "").trim().slice(0, 40) || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
    required: formData.get("required") === "on",
  };

  if (id) {
    const existing = await prisma.leaderAssignment.findFirst({
      where: { id, tripId },
      select: { id: true },
    });
    if (!existing) return { error: "That assignment no longer exists." };
    await prisma.leaderAssignment.update({ where: { id }, data });
  } else {
    const count = await prisma.leaderAssignment.count({ where: { tripId } });
    await prisma.leaderAssignment.create({ data: { ...data, tripId, sortOrder: count } });
  }

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/leaders`);
  return { ok: true };
}

export async function deleteLeaderAssignmentAction(assignmentId: string): Promise<FormState> {
  const assignment = await prisma.leaderAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(assignment.tripId);
  await prisma.leaderAssignment.delete({ where: { id: assignmentId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${assignment.tripId}/leaders`);
  return { ok: true };
}
