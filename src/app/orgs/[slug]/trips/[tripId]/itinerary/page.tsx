import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName, toDateInputValue } from "@/lib/format";
import { ItineraryBoard } from "./itinerary-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule" };

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  const [trip, items, attendees] = await Promise.all([
    prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { startDate: true, endDate: true },
    }),
    prisma.itineraryItem.findMany({
      where: { tripId },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
      include: {
        responsible: { select: { firstName: true, lastName: true, preferredName: true } },
      },
    }),
    prisma.attendee.findMany({
      where: { tripId, isLeader: true },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, preferredName: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">Schedule</h1>
          <p className="text-sm text-navy-soft">Everything, in order, readable on a phone.</p>
        </div>
        <Link
          href={`/print/trip/${tripId}/itinerary`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
        >
          Print schedule
        </Link>
      </div>

      <ItineraryBoard
        tripId={tripId}
        defaultDate={toDateInputValue(trip.startDate)}
        items={items.map((i) => ({
          id: i.id,
          title: i.title,
          date: i.date.toISOString().slice(0, 10),
          startTime: i.startTime,
          endTime: i.endTime,
          location: i.location,
          description: i.description,
          notes: i.notes,
          responsibleAttendeeId: i.responsibleAttendeeId,
          responsibleName: i.responsible ? displayName(i.responsible) : null,
        }))}
        leaders={attendees.map((a) => ({ id: a.id, name: displayName(a) }))}
      />
    </div>
  );
}
