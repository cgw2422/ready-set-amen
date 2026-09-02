import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName, formatDateTime } from "@/lib/format";
import { HeadcountScreen } from "./headcount-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Headcount" };

export default async function HeadcountSessionPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string; sessionId: string }>;
}) {
  const { slug, tripId, sessionId } = await params;
  await requireTrip(tripId);

  const session = await prisma.headcountSession.findFirst({
    where: { id: sessionId, tripId },
    include: {
      records: {
        include: {
          attendee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              isLeader: true,
              isMinor: true,
              phone: true,
            },
          },
        },
      },
    },
  });
  if (!session) notFound();

  return (
    <HeadcountScreen
      sessionId={session.id}
      label={session.label}
      startedAt={formatDateTime(session.startedAt)}
      closed={Boolean(session.closedAt)}
      backHref={`/orgs/${slug}/trips/${tripId}/headcount`}
      records={session.records
        .map((r) => ({
          attendeeId: r.attendeeId,
          name: displayName(r.attendee),
          isLeader: r.attendee.isLeader,
          isMinor: r.attendee.isMinor,
          phone: r.attendee.phone,
          present: r.present,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
