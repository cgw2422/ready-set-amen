import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName } from "@/lib/format";
import { LeaderBoard } from "./leader-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaders" };

export default async function LeadersPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTrip(tripId);

  const [assignments, attendees] = await Promise.all([
    prisma.leaderAssignment.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      include: {
        attendee: { select: { id: true, firstName: true, lastName: true, preferredName: true, phone: true } },
      },
    }),
    prisma.attendee.findMany({
      where: { tripId },
      orderBy: [{ isLeader: "desc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, preferredName: true, isLeader: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Leaders</h1>
        <p className="text-sm text-navy-soft">
          Who is responsible for what, so nobody assumes someone else has it.
        </p>
      </div>

      <LeaderBoard
        tripId={tripId}
        assignments={assignments.map((a) => ({
          id: a.id,
          role: a.role,
          attendeeId: a.attendeeId,
          personName: a.personName,
          personPhone: a.personPhone,
          notes: a.notes,
          required: a.required,
          filledName: a.attendee ? displayName(a.attendee) : a.personName,
          filledPhone: a.attendee?.phone ?? a.personPhone,
        }))}
        attendees={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          isLeader: a.isLeader,
        }))}
      />
    </div>
  );
}
