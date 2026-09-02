import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/trip-data";
import { displayName } from "@/lib/format";

/**
 * Everything the printable reports need, loaded once. Sections are selected by
 * key so the packet builder and the individual reports share one loader.
 */

export const PACKET_SECTIONS = [
  { key: "overview", label: "Trip Overview" },
  { key: "roster", label: "Attendee Roster" },
  { key: "guardians", label: "Parent / Guardian Contacts" },
  { key: "emergency", label: "Emergency Contacts" },
  { key: "medical", label: "Medical Information", sensitive: true },
  { key: "waivers", label: "Waiver Status" },
  { key: "vehicles", label: "Vehicle Assignments" },
  { key: "rooms", label: "Room Assignments" },
  { key: "payments", label: "Payment Status" },
  { key: "forms", label: "Forms Checklist" },
  { key: "itinerary", label: "Itinerary" },
  { key: "leaders", label: "Leader Assignments" },
  { key: "tasks", label: "Preparation Checklist" },
  { key: "prayer", label: "Prayer Focus" },
  { key: "phones", label: "Important Phone Numbers" },
] as const;

export type PacketSectionKey = (typeof PACKET_SECTIONS)[number]["key"];

export const DEFAULT_PACKET_SECTIONS: PacketSectionKey[] = [
  "overview",
  "roster",
  "emergency",
  "vehicles",
  "rooms",
  "itinerary",
  "leaders",
  "phones",
];

export async function loadTripPacket(tripId: string) {
  const [trip, attendees, vehicles, rooms, itinerary, tasks, leaders, prayer, requirements, waiverRecipients] =
    await Promise.all([
      prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: {
          id: true,
          name: true,
          destination: true,
          startDate: true,
          endDate: true,
          departureLocation: true,
          description: true,
          costPerPerson: true,
          prayerCompletedAt: true,
          prayerNotes: true,
          organization: { select: { name: true, city: true, state: true } },
        },
      }),
      prisma.attendee.findMany({
        where: { tripId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          guardians: { orderBy: { isPrimary: "desc" } },
          vehicleAssignment: { include: { vehicle: { select: { name: true } } } },
          roomAssignment: { include: { room: { select: { name: true } } } },
          documentStatuses: { include: { requirement: { select: { name: true, required: true } } } },
        },
      }),
      prisma.vehicle.findMany({
        where: { tripId },
        orderBy: { sortOrder: "asc" },
        include: {
          driver: { select: { firstName: true, lastName: true, preferredName: true, phone: true } },
          secondaryDriver: { select: { firstName: true, lastName: true, preferredName: true } },
          assignments: {
            include: {
              attendee: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  isLeader: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      prisma.room.findMany({
        where: { tripId },
        orderBy: { sortOrder: "asc" },
        include: {
          assignments: {
            include: {
              attendee: {
                select: { firstName: true, lastName: true, preferredName: true, isLeader: true },
              },
            },
          },
        },
      }),
      prisma.itineraryItem.findMany({
        where: { tripId },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        include: { responsible: { select: { firstName: true, lastName: true, preferredName: true } } },
      }),
      prisma.task.findMany({
        where: { tripId },
        orderBy: [{ isPrayerStep: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.leaderAssignment.findMany({
        where: { tripId },
        orderBy: { sortOrder: "asc" },
        include: {
          attendee: { select: { firstName: true, lastName: true, preferredName: true, phone: true } },
        },
      }),
      prisma.prayerFocus.findMany({ where: { tripId }, orderBy: { sortOrder: "asc" } }),
      prisma.documentRequirement.findMany({ where: { tripId }, orderBy: { sortOrder: "asc" } }),
      prisma.waiverRecipient.findMany({
        where: { requirement: { tripId } },
        include: {
          requirement: { select: { title: true } },
          attendee: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
          signedWaiver: { select: { signedAt: true, signerName: true } },
        },
        orderBy: [{ attendee: { lastName: "asc" } }],
      }),
    ]);

  const phoneBook = [
    ...leaders
      .map((l) => ({
        label: l.role,
        name: l.attendee ? displayName(l.attendee) : l.personName,
        phone: l.attendee?.phone ?? l.personPhone,
      }))
      .filter((p) => p.name && p.phone),
    ...vehicles
      .map((v) => ({
        label: `${v.name} driver`,
        name: v.driver ? displayName(v.driver) : v.driverName,
        phone: v.driver?.phone ?? v.driverPhone,
      }))
      .filter((p) => p.name && p.phone),
  ];

  return {
    trip,
    attendees,
    vehicles,
    rooms,
    itinerary,
    tasks,
    leaders,
    prayer,
    requirements,
    waiverRecipients,
    phoneBook,
    totals: {
      due: attendees.reduce((s, a) => s + toNumber(a.amountDue), 0),
      paid: attendees.reduce((s, a) => s + toNumber(a.amountPaid), 0),
    },
  };
}

export type PacketData = Awaited<ReturnType<typeof loadTripPacket>>;
