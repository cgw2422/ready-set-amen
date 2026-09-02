import { prisma } from "@/lib/db";
import {
  computeReadiness,
  type ReadinessConfig,
  type ReadinessInput,
  type ReadinessResult,
} from "@/lib/readiness";
import type { Prisma } from "@prisma/client";

export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * One pass over a trip that feeds both the readiness score and the dashboard
 * problem list. Everything the dashboard needs comes from here so a leader's
 * home screen is a single round of queries.
 */
export async function loadTripReadiness(tripId: string): Promise<{
  readiness: ReadinessResult;
  counts: {
    attendees: number;
    minors: number;
    leaders: number;
    totalDue: number;
    totalPaid: number;
    waiversRequired: number;
    waiversSigned: number;
    waiversOutstanding: number;
    vehicles: number;
    rooms: number;
    itineraryItems: number;
  };
}> {
  const [trip, attendees, waiverRecipients, docStatuses, vehicles, rooms, leaders, tasks, itineraryCount] =
    await Promise.all([
      prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { readinessConfig: true, prayerCompletedAt: true },
      }),
      prisma.attendee.findMany({
        where: { tripId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          isMinor: true,
          isLeader: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          amountDue: true,
          amountPaid: true,
          paymentStatus: true,
          guardians: { select: { id: true }, take: 1 },
          vehicleAssignment: { select: { vehicleId: true } },
          roomAssignment: { select: { roomId: true } },
        },
      }),
      prisma.waiverRecipient.findMany({
        where: { requirement: { tripId } },
        select: { status: true },
      }),
      prisma.attendeeDocumentStatus.findMany({
        where: { requirement: { tripId, required: true } },
        select: { status: true },
      }),
      prisma.vehicle.findMany({
        where: { tripId },
        select: {
          id: true,
          name: true,
          capacity: true,
          reservedSeats: true,
          driverAttendeeId: true,
          driverName: true,
          _count: { select: { assignments: true } },
        },
      }),
      prisma.room.findMany({
        where: { tripId },
        select: {
          id: true,
          name: true,
          capacity: true,
          requiresLeader: true,
          assignments: { select: { attendee: { select: { isLeader: true } } } },
        },
      }),
      prisma.leaderAssignment.findMany({
        where: { tripId },
        select: { role: true, required: true, attendeeId: true, personName: true },
      }),
      prisma.task.findMany({
        where: { tripId },
        select: { id: true, title: true, status: true, isPrayerStep: true },
      }),
      prisma.itineraryItem.count({ where: { tripId } }),
    ]);

  const attendeeSnapshots: ReadinessInput["attendees"] = attendees.map((a) => {
    const due = toNumber(a.amountDue);
    const paid = toNumber(a.amountPaid);
    return {
      id: a.id,
      name: `${a.preferredName || a.firstName} ${a.lastName}`.trim(),
      isMinor: a.isMinor,
      isLeader: a.isLeader,
      hasEmergencyContact: Boolean(a.emergencyContactName?.trim() && a.emergencyContactPhone?.trim()),
      hasGuardian: a.guardians.length > 0,
      amountDue: due,
      amountPaid: paid,
      paymentSettled:
        a.paymentStatus === "PAID" ||
        a.paymentStatus === "SCHOLARSHIP" ||
        a.paymentStatus === "WAIVED" ||
        (due > 0 && paid >= due) ||
        due === 0,
      vehicleId: a.vehicleAssignment?.vehicleId ?? null,
      roomId: a.roomAssignment?.roomId ?? null,
    };
  });

  const waivers = {
    required: waiverRecipients.filter((r) => r.status !== "NOT_REQUIRED").length,
    signed: waiverRecipients.filter((r) => r.status === "SIGNED").length,
    notRequired: 0,
    sent: waiverRecipients.filter((r) => r.status === "SENT" || r.status === "VIEWED").length,
    viewed: waiverRecipients.filter((r) => r.status === "VIEWED").length,
  };

  const forms = {
    required: docStatuses.filter((d) => d.status !== "NOT_REQUIRED").length,
    complete: docStatuses.filter((d) => d.status === "COMPLETE").length,
  };

  const input: ReadinessInput = {
    config: (trip.readinessConfig as ReadinessConfig | null) ?? {},
    attendees: attendeeSnapshots,
    waivers,
    forms,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      name: v.name,
      capacity: Math.max(0, v.capacity - v.reservedSeats),
      assigned: v._count.assignments,
      hasDriver: Boolean(v.driverAttendeeId || v.driverName?.trim()),
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      assigned: r.assignments.length,
      requiresLeader: r.requiresLeader,
      leaderCount: r.assignments.filter((a) => a.attendee.isLeader).length,
    })),
    leaders: leaders.map((l) => ({
      role: l.role,
      required: l.required,
      filled: Boolean(l.attendeeId || l.personName?.trim()),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.status === "DONE",
      isPrayerStep: t.isPrayerStep,
    })),
    prayerCompletedAt: trip.prayerCompletedAt,
  };

  const readiness = computeReadiness(input);

  return {
    readiness,
    counts: {
      attendees: attendees.length,
      minors: attendees.filter((a) => a.isMinor).length,
      leaders: attendees.filter((a) => a.isLeader).length,
      totalDue: attendeeSnapshots.reduce((s, a) => s + a.amountDue, 0),
      totalPaid: attendeeSnapshots.reduce((s, a) => s + a.amountPaid, 0),
      waiversRequired: waivers.required,
      waiversSigned: waivers.signed,
      waiversOutstanding: Math.max(0, waivers.required - waivers.signed),
      vehicles: vehicles.length,
      rooms: rooms.length,
      itineraryItems: itineraryCount,
    },
  };
}
