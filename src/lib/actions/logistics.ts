"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import {
  autoAssignRooms,
  autoAssignVehicles,
  type AssignPerson,
} from "@/lib/auto-assign";
import { displayName } from "@/lib/format";
import type { FormState } from "@/lib/actions/auth";

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const vehicleSchema = z.object({
  name: z.string().trim().min(1, "Give the vehicle a name").max(80),
  type: z.string().trim().max(40),
  capacity: z.number().int().min(1).max(120),
  reservedSeats: z.number().int().min(0).max(120),
  driverAttendeeId: z.string().max(40).nullable(),
  secondaryDriverAttendeeId: z.string().max(40).nullable(),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function readVehicle(formData: FormData) {
  return vehicleSchema.safeParse({
    name: formData.get("name"),
    type: String(formData.get("type") ?? "Van"),
    capacity: Number(formData.get("capacity") ?? 15),
    reservedSeats: Number(formData.get("reservedSeats") ?? 0),
    driverAttendeeId: String(formData.get("driverAttendeeId") ?? "") || null,
    secondaryDriverAttendeeId: String(formData.get("secondaryDriverAttendeeId") ?? "") || null,
    driverName: formData.get("driverName") ?? undefined,
    driverPhone: formData.get("driverPhone") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createVehicleAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const parsed = readVehicle(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.reservedSeats >= parsed.data.capacity) {
    return { error: "Reserved seats must leave room for passengers." };
  }

  const count = await prisma.vehicle.count({ where: { tripId } });
  await prisma.vehicle.create({
    data: {
      tripId,
      name: parsed.data.name,
      type: parsed.data.type || "Van",
      capacity: parsed.data.capacity,
      reservedSeats: parsed.data.reservedSeats,
      driverAttendeeId: parsed.data.driverAttendeeId,
      secondaryDriverAttendeeId: parsed.data.secondaryDriverAttendeeId,
      driverName: parsed.data.driverName?.trim() || null,
      driverPhone: parsed.data.driverPhone?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      sortOrder: count,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/transportation`);
  return { ok: true };
}

export async function updateVehicleAction(
  vehicleId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(vehicle.tripId);

  const parsed = readVehicle(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      name: parsed.data.name,
      type: parsed.data.type || "Van",
      capacity: parsed.data.capacity,
      reservedSeats: parsed.data.reservedSeats,
      driverAttendeeId: parsed.data.driverAttendeeId,
      secondaryDriverAttendeeId: parsed.data.secondaryDriverAttendeeId,
      driverName: parsed.data.driverName?.trim() || null,
      driverPhone: parsed.data.driverPhone?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${vehicle.tripId}/transportation`);
  return { ok: true };
}

export async function deleteVehicleAction(vehicleId: string): Promise<FormState> {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(vehicle.tripId);
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${vehicle.tripId}/transportation`);
  return { ok: true };
}

/** Assigning is an upsert on attendeeId, so tapping a new vehicle just moves them. */
export async function assignVehicleAction(
  attendeeId: string,
  vehicleId: string | null,
): Promise<FormState> {
  const attendee = await prisma.attendee.findUniqueOrThrow({
    where: { id: attendeeId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(attendee.tripId);

  if (vehicleId === null) {
    await prisma.vehicleAssignment.deleteMany({ where: { attendeeId } });
  } else {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, tripId: attendee.tripId },
      select: { id: true, capacity: true, reservedSeats: true, _count: { select: { assignments: true } } },
    });
    if (!vehicle) return { error: "That vehicle isn't on this trip." };

    const alreadyHere = await prisma.vehicleAssignment.findFirst({
      where: { attendeeId, vehicleId },
      select: { id: true },
    });
    if (!alreadyHere && vehicle._count.assignments >= vehicle.capacity - vehicle.reservedSeats) {
      return { error: "That vehicle is full. Free a seat or raise its capacity first." };
    }

    await prisma.vehicleAssignment.upsert({
      where: { attendeeId },
      create: { attendeeId, vehicleId },
      update: { vehicleId },
    });
  }

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/transportation`);
  return { ok: true };
}

export async function autoAssignVehiclesAction(
  tripId: string,
  options: { keepFamiliesTogether: boolean; reassignAll: boolean },
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  const [attendees, vehicles] = await Promise.all([
    prisma.attendee.findMany({
      where: { tripId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        isLeader: true,
        gender: true,
        vehicleAssignment: { select: { vehicleId: true } },
      },
    }),
    prisma.vehicle.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
        reservedSeats: true,
        driverAttendeeId: true,
        secondaryDriverAttendeeId: true,
      },
    }),
  ]);

  if (vehicles.length === 0) return { error: "Add a vehicle first." };

  const people: AssignPerson[] = attendees.map((a) => ({
    id: a.id,
    name: displayName(a),
    isLeader: a.isLeader,
    gender: a.gender,
    // Shared last name is the practical stand-in for "same family".
    groupKey: options.keepFamiliesTogether ? a.lastName.toLowerCase() : null,
  }));

  const existing = new Map(
    attendees
      .filter((a) => a.vehicleAssignment)
      .map((a) => [a.id, a.vehicleAssignment!.vehicleId] as const),
  );

  const plan = autoAssignVehicles({
    people,
    vehicles,
    existing,
    keepGroupsTogether: options.keepFamiliesTogether,
    reassignAll: options.reassignAll,
  });

  await prisma.$transaction([
    prisma.vehicleAssignment.deleteMany({ where: { attendee: { tripId } } }),
    ...[...plan.placements.entries()].map(([attendeeId, vehicleId]) =>
      prisma.vehicleAssignment.create({ data: { attendeeId, vehicleId } }),
    ),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/transportation`);
  return plan.unplaced.length > 0
    ? {
        error: `${plan.unplaced.length} ${plan.unplaced.length === 1 ? "person" : "people"} couldn't be seated — you need more seats.`,
      }
    : { ok: true };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  name: z.string().trim().min(1, "Give the room a name").max(80),
  type: z.string().trim().max(40),
  capacity: z.number().int().min(1).max(60),
  designation: z.string().trim().max(40),
  requiresLeader: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

function readRoom(formData: FormData) {
  return roomSchema.safeParse({
    name: formData.get("name"),
    type: String(formData.get("type") ?? "Hotel Room"),
    capacity: Number(formData.get("capacity") ?? 4),
    designation: String(formData.get("designation") ?? "ANY"),
    requiresLeader: formData.get("requiresLeader") === "on",
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createRoomAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const parsed = readRoom(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const count = await prisma.room.count({ where: { tripId } });
  await prisma.room.create({
    data: {
      tripId,
      name: parsed.data.name,
      type: parsed.data.type || "Hotel Room",
      capacity: parsed.data.capacity,
      designation: parsed.data.designation || "ANY",
      requiresLeader: parsed.data.requiresLeader,
      notes: parsed.data.notes?.trim() || null,
      sortOrder: count,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/lodging`);
  return { ok: true };
}

export async function updateRoomAction(
  roomId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(room.tripId);

  const parsed = readRoom(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  await prisma.room.update({
    where: { id: roomId },
    data: {
      name: parsed.data.name,
      type: parsed.data.type || "Hotel Room",
      capacity: parsed.data.capacity,
      designation: parsed.data.designation || "ANY",
      requiresLeader: parsed.data.requiresLeader,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${room.tripId}/lodging`);
  return { ok: true };
}

export async function deleteRoomAction(roomId: string): Promise<FormState> {
  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(room.tripId);
  await prisma.room.delete({ where: { id: roomId } });
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${room.tripId}/lodging`);
  return { ok: true };
}

export async function assignRoomAction(
  attendeeId: string,
  roomId: string | null,
): Promise<FormState> {
  const attendee = await prisma.attendee.findUniqueOrThrow({
    where: { id: attendeeId },
    select: { id: true, tripId: true },
  });
  const ctx = await requireTrip(attendee.tripId);

  if (roomId === null) {
    await prisma.roomAssignment.deleteMany({ where: { attendeeId } });
  } else {
    const room = await prisma.room.findFirst({
      where: { id: roomId, tripId: attendee.tripId },
      select: { id: true, capacity: true, _count: { select: { assignments: true } } },
    });
    if (!room) return { error: "That room isn't on this trip." };

    const alreadyHere = await prisma.roomAssignment.findFirst({
      where: { attendeeId, roomId },
      select: { id: true },
    });
    if (!alreadyHere && room._count.assignments >= room.capacity) {
      return { error: "That room is full. Free a spot or raise its capacity first." };
    }

    await prisma.roomAssignment.upsert({
      where: { attendeeId },
      create: { attendeeId, roomId },
      update: { roomId },
    });
  }

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/lodging`);
  return { ok: true };
}

export async function autoAssignRoomsAction(
  tripId: string,
  options: { separateGenders: boolean; keepFamiliesTogether: boolean; reassignAll: boolean },
): Promise<FormState> {
  const ctx = await requireTrip(tripId);

  const [attendees, rooms] = await Promise.all([
    prisma.attendee.findMany({
      where: { tripId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        isLeader: true,
        gender: true,
        roomAssignment: { select: { roomId: true } },
      },
    }),
    prisma.room.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, capacity: true, designation: true, requiresLeader: true },
    }),
  ]);

  if (rooms.length === 0) return { error: "Add a room first." };

  const people: AssignPerson[] = attendees.map((a) => ({
    id: a.id,
    name: displayName(a),
    isLeader: a.isLeader,
    gender: a.gender,
    groupKey: options.keepFamiliesTogether ? a.lastName.toLowerCase() : null,
  }));

  const existing = new Map(
    attendees
      .filter((a) => a.roomAssignment)
      .map((a) => [a.id, a.roomAssignment!.roomId] as const),
  );

  const plan = autoAssignRooms({
    people,
    rooms,
    existing,
    separateGenders: options.separateGenders,
    keepGroupsTogether: options.keepFamiliesTogether,
    keepApart: [],
    reassignAll: options.reassignAll,
  });

  await prisma.$transaction([
    prisma.roomAssignment.deleteMany({ where: { attendee: { tripId } } }),
    ...[...plan.placements.entries()].map(([attendeeId, roomId]) =>
      prisma.roomAssignment.create({ data: { attendeeId, roomId } }),
    ),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/lodging`);
  return plan.unplaced.length > 0
    ? {
        error: `${plan.unplaced.length} ${plan.unplaced.length === 1 ? "person" : "people"} couldn't be placed. Check room capacity and gender designations.`,
      }
    : { ok: true };
}
