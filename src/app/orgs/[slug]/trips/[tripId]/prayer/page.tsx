import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { loadTripReadiness } from "@/lib/trip-data";
import { PrayerScreen } from "./prayer-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prayer" };

const SUGGESTIONS = [
  "Safe travel",
  "Protection",
  "Unity",
  "Spiritual growth",
  "Salvation",
  "Healing",
  "Students responding to preaching",
  "Our leaders",
  "The people we're going to serve",
];

export default async function PrayerPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  const [trip, focuses, { readiness, counts }] = await Promise.all([
    prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { name: true, prayerCompletedAt: true, prayerNotes: true },
    }),
    prisma.prayerFocus.findMany({ where: { tripId }, orderBy: { sortOrder: "asc" } }),
    loadTripReadiness(tripId),
  ]);

  return (
    <PrayerScreen
      tripId={tripId}
      tripName={trip.name}
      attendeeCount={counts.attendees}
      completedAt={trip.prayerCompletedAt ? trip.prayerCompletedAt.toISOString() : null}
      notes={trip.prayerNotes ?? ""}
      focuses={focuses.map((f) => ({ id: f.id, text: f.text }))}
      suggestions={SUGGESTIONS}
      logisticsComplete={readiness.logisticsComplete}
      readinessPercent={readiness.percent}
      dashboardHref={`/orgs/${slug}/trips/${tripId}`}
    />
  );
}
