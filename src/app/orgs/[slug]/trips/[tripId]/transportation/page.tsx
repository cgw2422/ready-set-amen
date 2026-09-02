import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName } from "@/lib/format";
import { TransportationBoard } from "./transportation-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transportation" };

export default async function TransportationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, tripId } = await params;
  const { new: startNew } = await searchParams;
  await requireTrip(tripId);

  const [vehicles, attendees] = await Promise.all([
    prisma.vehicle.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
        secondaryDriver: {
          select: { id: true, firstName: true, lastName: true, preferredName: true },
        },
        assignments: {
          include: {
            attendee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
                isLeader: true,
                isMinor: true,
              },
            },
          },
        },
      },
    }),
    prisma.attendee.findMany({
      where: { tripId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        isLeader: true,
        isMinor: true,
        vehicleAssignment: { select: { vehicleId: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">Transportation</h1>
          <p className="text-sm text-navy-soft">
            Every person needs a seat, and every vehicle needs a driver.
          </p>
        </div>
        <Link
          href={`/print/trip/${tripId}/vehicles`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
        >
          Print vehicle rosters
        </Link>
      </div>

      <TransportationBoard
        tripId={tripId}
        startNew={startNew === "1"}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          capacity: v.capacity,
          reservedSeats: v.reservedSeats,
          notes: v.notes,
          driverAttendeeId: v.driverAttendeeId,
          secondaryDriverAttendeeId: v.secondaryDriverAttendeeId,
          driverName: v.driverName,
          driverPhone: v.driverPhone,
          driverLabel: v.driver ? displayName(v.driver) : (v.driverName ?? null),
          secondaryDriverLabel: v.secondaryDriver ? displayName(v.secondaryDriver) : null,
          passengers: v.assignments
            .map((a) => ({
              id: a.attendee.id,
              name: displayName(a.attendee),
              isLeader: a.attendee.isLeader,
              isMinor: a.attendee.isMinor,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))}
        attendees={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          isLeader: a.isLeader,
          isMinor: a.isMinor,
          vehicleId: a.vehicleAssignment?.vehicleId ?? null,
        }))}
      />
    </div>
  );
}
