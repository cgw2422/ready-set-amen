"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { HeadcountScope } from "@prisma/client";
import type { FormState } from "@/lib/actions/auth";

/**
 * A headcount session is a snapshot: the people expected are fixed the moment
 * it starts, so adding someone to the roster mid-count doesn't quietly change
 * the number a leader is standing there reading.
 */
export async function startHeadcountAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  const scopeRaw = String(formData.get("scope") ?? "TRIP");
  const scope: HeadcountScope = ["TRIP", "VEHICLE", "ROOM", "CUSTOM"].includes(scopeRaw)
    ? (scopeRaw as HeadcountScope)
    : "TRIP";
  const scopeId = String(formData.get("scopeId") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim() || "Headcount";

  let attendeeIds: string[];
  if (scope === "VEHICLE" && scopeId) {
    const rows = await prisma.vehicleAssignment.findMany({
      where: { vehicleId: scopeId, vehicle: { tripId } },
      select: { attendeeId: true },
    });
    attendeeIds = rows.map((r) => r.attendeeId);
  } else if (scope === "ROOM" && scopeId) {
    const rows = await prisma.roomAssignment.findMany({
      where: { roomId: scopeId, room: { tripId } },
      select: { attendeeId: true },
    });
    attendeeIds = rows.map((r) => r.attendeeId);
  } else if (scope === "CUSTOM") {
    const selected = formData.getAll("attendeeIds").map(String);
    const rows = await prisma.attendee.findMany({
      where: { tripId, id: { in: selected } },
      select: { id: true },
    });
    attendeeIds = rows.map((r) => r.id);
  } else {
    const rows = await prisma.attendee.findMany({ where: { tripId }, select: { id: true } });
    attendeeIds = rows.map((r) => r.id);
  }

  if (attendeeIds.length === 0) {
    return { error: "There's nobody in that group to count yet." };
  }

  const session = await prisma.headcountSession.create({
    data: {
      tripId,
      label: label.slice(0, 120),
      scope,
      scopeId,
      startedBy: ctx.userId,
      expectedCount: attendeeIds.length,
      records: { create: attendeeIds.map((attendeeId) => ({ attendeeId })) },
    },
    select: { id: true },
  });

  redirect(`/orgs/${ctx.organization.slug}/trips/${tripId}/headcount/${session.id}`);
}

async function sessionTrip(sessionId: string) {
  const session = await prisma.headcountSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(session.tripId);
  return { session, ctx };
}

/**
 * Marking one person present.
 *
 * This is the hottest path in the app: counting fifty students means fifty of
 * these in about a minute, on hotel wifi, while walking. Two things keep it
 * fast:
 *
 *  - Authorization is one query. The session is resolved through its trip and
 *    the caller's organization membership in a single join rather than a
 *    session lookup followed by a separate trip lookup.
 *  - There is deliberately no revalidatePath. The screen already shows the
 *    change optimistically, so re-rendering fifty rows and shipping a fresh
 *    payload on every tap would buy nothing and cost a second per person.
 *    Reloading the page reads the true state from the database.
 */
export async function toggleHeadcountRecordAction(
  sessionId: string,
  attendeeId: string,
  present: boolean,
): Promise<FormState> {
  const user = await requireUser();

  const updated = await prisma.headcountRecord.updateMany({
    where: {
      sessionId,
      attendeeId,
      session: {
        trip: { organization: { members: { some: { userId: user.id } } } },
      },
    },
    data: { present, markedAt: present ? new Date() : null },
  });

  if (updated.count === 0) return { error: "That headcount is no longer available." };
  return { ok: true };
}

export async function markAllPresentAction(sessionId: string): Promise<FormState> {
  const { ctx, session } = await sessionTrip(sessionId);
  await prisma.headcountRecord.updateMany({
    where: { sessionId, present: false },
    data: { present: true, markedAt: new Date() },
  });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${session.tripId}/headcount/${sessionId}`);
  return { ok: true };
}

export async function resetHeadcountAction(sessionId: string): Promise<FormState> {
  const { ctx, session } = await sessionTrip(sessionId);
  await prisma.headcountRecord.updateMany({
    where: { sessionId },
    data: { present: false, markedAt: null },
  });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${session.tripId}/headcount/${sessionId}`);
  return { ok: true };
}

export async function closeHeadcountAction(sessionId: string): Promise<void> {
  const { ctx, session } = await sessionTrip(sessionId);
  await prisma.headcountSession.update({
    where: { id: sessionId },
    data: { closedAt: new Date() },
  });
  redirect(`/orgs/${ctx.organization.slug}/trips/${session.tripId}/headcount`);
}

export async function deleteHeadcountAction(sessionId: string): Promise<FormState> {
  const { ctx, session } = await sessionTrip(sessionId);
  await prisma.headcountSession.delete({ where: { id: sessionId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${session.tripId}/headcount`);
  return { ok: true };
}
