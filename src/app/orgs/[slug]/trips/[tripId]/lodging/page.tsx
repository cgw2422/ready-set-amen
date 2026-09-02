import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName } from "@/lib/format";
import { LodgingBoard } from "./lodging-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lodging" };

export default async function LodgingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, tripId } = await params;
  const { new: startNew } = await searchParams;
  await requireTrip(tripId);

  const [rooms, attendees] = await Promise.all([
    prisma.room.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      include: {
        assignments: {
          include: {
            attendee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
                isLeader: true,
                gender: true,
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
        gender: true,
        roomAssignment: { select: { roomId: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">Lodging</h1>
          <p className="text-sm text-navy-soft">
            Hotel rooms, cabins, dorms — everyone needs a bed and a leader nearby.
          </p>
        </div>
        <Link
          href={`/print/trip/${tripId}/rooms`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
        >
          Print room rosters
        </Link>
      </div>

      <LodgingBoard
        tripId={tripId}
        startNew={startNew === "1"}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          capacity: r.capacity,
          designation: r.designation,
          requiresLeader: r.requiresLeader,
          notes: r.notes,
          occupants: r.assignments
            .map((a) => ({
              id: a.attendee.id,
              name: displayName(a.attendee),
              isLeader: a.attendee.isLeader,
              gender: a.attendee.gender,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))}
        attendees={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          isLeader: a.isLeader,
          gender: a.gender,
          roomId: a.roomAssignment?.roomId ?? null,
        }))}
      />
    </div>
  );
}
