import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";
import { StartHeadcountForm } from "./start-headcount-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Headcount" };

export default async function HeadcountPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const [vehicles, rooms, sessions, attendeeCount] = await Promise.all([
    prisma.vehicle.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, _count: { select: { assignments: true } } },
    }),
    prisma.room.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, _count: { select: { assignments: true } } },
    }),
    prisma.headcountSession.findMany({
      where: { tripId },
      orderBy: { startedAt: "desc" },
      take: 25,
      select: {
        id: true,
        label: true,
        scope: true,
        startedAt: true,
        closedAt: true,
        expectedCount: true,
        _count: { select: { records: true } },
        records: { where: { present: true }, select: { id: true } },
      },
    }),
    prisma.attendee.count({ where: { tripId } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Headcount</h1>
        <p className="text-sm text-navy-soft">
          Big taps, big numbers. Built for standing beside a van with one hand free.
        </p>
      </div>

      <StartHeadcountForm
        tripId={tripId}
        attendeeCount={attendeeCount}
        vehicles={vehicles.map((v) => ({ id: v.id, name: v.name, count: v._count.assignments }))}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, count: r._count.assignments }))}
      />

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-navy">Recent counts</h2>
        {sessions.length === 0 ? (
          <EmptyState
            title="No headcounts yet."
            description="Start one before you pull out of the parking lot."
          />
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const present = session.records.length;
              const complete = present >= session._count.records;
              return (
                <Card as="li" key={session.id} className="p-0">
                  <Link
                    href={`${base}/headcount/${session.id}`}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{session.label}</p>
                      <p className="text-xs text-navy-faint">
                        {formatDateTime(session.startedAt)}
                        {session.closedAt ? " · closed" : " · open"}
                      </p>
                    </div>
                    <Badge tone={complete ? "green" : "coral"}>
                      {present} / {session._count.records}
                    </Badge>
                  </Link>
                </Card>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
