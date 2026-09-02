import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { loadTripReadiness } from "@/lib/trip-data";
import { formatDate, formatDateRange, money } from "@/lib/format";
import { Badge, Card, LinkButton, ProgressBar, ProgressRing } from "@/components/ui";
import { Confetti, Wordmark } from "@/components/brand";
import type { ReadinessCategoryKey } from "@/lib/readiness";

export const dynamic = "force-dynamic";

const CATEGORY_HREF: Record<ReadinessCategoryKey, string> = {
  attendees: "/people",
  waivers: "/waivers",
  forms: "/forms",
  payments: "/payments",
  transportation: "/transportation",
  lodging: "/lodging",
  leaders: "/leaders",
  tasks: "/tasks",
};

const ISSUE_HREF: Record<ReadinessCategoryKey | "prayer", string> = {
  ...CATEGORY_HREF,
  prayer: "/prayer",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { tripId } = await params;
  const ctx = await requireTrip(tripId);
  return { title: ctx.trip.name };
}

export default async function TripDashboard({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const [trip, { readiness, counts }] = await Promise.all([
    prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        name: true,
        destination: true,
        startDate: true,
        endDate: true,
        departureLocation: true,
        departureTime: true,
        prayerCompletedAt: true,
        organization: { select: { name: true } },
      },
    }),
    loadTripReadiness(tripId),
  ]);

  const actionIssues = readiness.issues.filter((i) => i.severity !== "info");
  const infoIssues = readiness.issues.filter((i) => i.severity === "info");

  return (
    <div className="space-y-5">
      {/* Trip header ------------------------------------------------------- */}
      <section className="overflow-hidden rounded-2xl bg-green-brand text-white">
        <div className="px-5 pb-6 pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
            {trip.organization.name}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">{trip.name}</h1>
          <p className="mt-1 text-white/85">{trip.destination || "Destination not set"}</p>
          <p className="text-sm text-white/70">{formatDateRange(trip.startDate, trip.endDate)}</p>
          {trip.departureLocation ? (
            <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              Meet at {trip.departureLocation}
              {trip.startDate ? ` · ${formatDate(trip.startDate)}` : ""}
            </p>
          ) : null}
        </div>
      </section>

      {/* Readiness --------------------------------------------------------- */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <ProgressRing percent={readiness.percent} label={`Trip readiness ${readiness.percent}%`} />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-navy">Trip readiness</p>
            <p className="text-sm text-navy-soft">
              {readiness.allDone
                ? "Everything is ready and the group has been covered in prayer."
                : readiness.logisticsComplete
                  ? "You've checked the boxes. One meaningful step left."
                  : readiness.percent >= 80
                    ? "Almost ready! A few things left to finish."
                    : "Here's where the trip stands right now."}
            </p>
            <p className="mt-2 text-sm text-navy-faint">
              {counts.attendees} {counts.attendees === 1 ? "person" : "people"} ·{" "}
              {counts.minors} {counts.minors === 1 ? "minor" : "minors"}
            </p>
          </div>
        </div>
      </Card>

      {/* Prayer / branded completion --------------------------------------- */}
      {readiness.allDone ? (
        <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-center text-white animate-pop">
          <Confetti className="pointer-events-none absolute inset-x-0 top-1 h-14 w-full" />
          <div className="relative flex justify-center">
            <Wordmark size="md" />
          </div>
          <p className="mt-5 font-display text-xl font-extrabold">You&rsquo;re ready to go.</p>
          <p className="mt-1 text-sm text-white/70">
            Prayed over on {formatDate(trip.prayerCompletedAt)}.
          </p>
        </section>
      ) : readiness.logisticsComplete ? (
        <section className="rounded-2xl border border-gold/40 bg-gold-soft px-5 py-6 text-center">
          <p className="font-display text-xl font-extrabold text-navy">
            You&rsquo;ve checked the boxes.
          </p>
          <p className="mt-1 text-navy-soft">Now let&rsquo;s cover the trip in prayer.</p>
          <LinkButton href={`${base}/prayer`} className="mt-4">
            Pray over the group
          </LinkButton>
        </section>
      ) : null}

      {/* Problems first ---------------------------------------------------- */}
      {actionIssues.length > 0 ? (
        <Card className="p-5">
          <p className="font-display text-lg font-bold text-navy">A few things need you</p>
          <ul className="mt-3 space-y-2">
            {actionIssues.slice(0, 8).map((issue, index) => (
              <li key={index}>
                <Link
                  href={`${base}${ISSUE_HREF[issue.category]}`}
                  className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-cream"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      issue.severity === "action" ? "bg-coral" : "bg-gold"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-sm text-navy">{issue.message}</span>
                  <span aria-hidden="true" className="text-navy-faint">
                    &rsaquo;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {actionIssues.length > 8 ? (
            <p className="mt-2 text-xs text-navy-faint">
              +{actionIssues.length - 8} more to review inside each section.
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="p-5">
          <p className="font-display text-lg font-bold text-navy">Nothing is blocking you.</p>
          <p className="mt-1 text-sm text-navy-soft">
            Every required item is either complete or marked not required.
          </p>
        </Card>
      )}

      {infoIssues.length > 0 ? (
        <ul className="space-y-2">
          {infoIssues.map((issue, index) => (
            <li key={index}>
              <Link
                href={`${base}${ISSUE_HREF[issue.category]}`}
                className="block rounded-xl border border-line bg-white px-4 py-3 text-sm text-navy-soft hover:bg-cream"
              >
                {issue.message}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Status cards ------------------------------------------------------ */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-navy">Where things stand</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {readiness.categories
            .filter((c) => c.enabled)
            .map((category) => (
              <Card as="li" key={category.key} className="p-0">
                <Link href={`${base}${CATEGORY_HREF[category.key]}`} className="block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-navy">{category.label}</p>
                    {category.applicable ? (
                      <Badge tone={category.ratio >= 1 ? "green" : category.ratio >= 0.6 ? "gold" : "coral"}>
                        {Math.round(category.ratio * 100)}%
                      </Badge>
                    ) : (
                      <Badge tone="muted">Not started</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-navy-soft">{category.summary}</p>
                  <div className="mt-3">
                    <ProgressBar
                      percent={category.applicable ? category.ratio * 100 : 0}
                      tone={category.ratio >= 1 ? "green" : "gold"}
                    />
                  </div>
                </Link>
              </Card>
            ))}

          <Card as="li" className="p-0">
            <Link href={`${base}/prayer`} className="block p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-navy">Prayer</p>
                <Badge tone={readiness.prayerComplete ? "green" : "muted"}>
                  {readiness.prayerComplete ? "Covered" : "Not yet"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-navy-soft">
                {readiness.prayerComplete
                  ? `Prayed over on ${formatDate(trip.prayerCompletedAt)}`
                  : "Pray over the group before you go."}
              </p>
              <p className="mt-3 text-xs text-navy-faint">
                Prayer is never scored — it&rsquo;s the last step, not a number.
              </p>
            </Link>
          </Card>
        </ul>
      </section>

      {/* Quick actions ------------------------------------------------------ */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-navy">Right now</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkButton href={`${base}/headcount`} size="lg" className="w-full">
            Start a headcount
          </LinkButton>
          <LinkButton href={`${base}/emergency`} variant="danger" size="lg" className="w-full">
            Emergency info
          </LinkButton>
          <LinkButton href={`${base}/packet`} variant="secondary" size="lg" className="w-full">
            Trip packet
          </LinkButton>
        </div>
      </section>

      <p className="pb-2 text-center text-xs text-navy-faint">
        {money(counts.totalPaid)} of {money(counts.totalDue)} collected ·{" "}
        {counts.waiversSigned} of {counts.waiversRequired} waivers signed
      </p>
    </div>
  );
}
