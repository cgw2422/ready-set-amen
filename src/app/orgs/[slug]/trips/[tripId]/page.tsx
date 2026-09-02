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
          <p className="mt-5 font-display text-xl font-extrabold">
            <span className="sr-only">Ready. Set. Amen. </span>You&rsquo;re ready to go.
          </p>
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

      {/* Problems first, stated plainly, each one a tap from the fix ------- */}
      {actionIssues.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <p className="font-display text-lg font-bold text-navy">Needs your attention</p>
            <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-bold text-navy">
              {actionIssues.length}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {actionIssues.map((issue, index) => (
              <li key={index}>
                <Link
                  href={`${base}${issue.href}`}
                  className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-cream active:bg-cream-deep"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      issue.severity === "action"
                        ? "bg-coral-soft text-coral-deep"
                        : "bg-gold-soft text-gold-deep"
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                      <path
                        d="M12 8v5M12 16.5h.01"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-bold leading-tight text-navy">
                      {issue.headline}
                    </span>
                    <span className="block text-xs text-navy-soft">{issue.message}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-navy-faint">
                    &rsaquo;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
                href={`${base}${issue.href}`}
                className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-navy-soft hover:bg-cream"
              >
                <span>{issue.message}</span>
                <span aria-hidden="true" className="text-navy-faint">
                  &rsaquo;
                </span>
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
