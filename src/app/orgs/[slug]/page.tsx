import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/access";
import { formatDateRange } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { OrgMenu } from "@/components/org-menu";
import { isPlatformAdmin } from "@/lib/platform";
import { FreeSetupBadge } from "@/components/free-setup-badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  return { title: ctx.organization.name };
}

const STATUS_TONE = {
  PLANNING: "gold",
  READY: "green",
  IN_PROGRESS: "green",
  COMPLETED: "muted",
  ARCHIVED: "muted",
} as const;

const STATUS_LABEL = {
  PLANNING: "Planning",
  READY: "Ready",
  IN_PROGRESS: "On the road",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
} as const;

export default async function OrgTripsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);

  const trips = await prisma.trip.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      destination: true,
      startDate: true,
      endDate: true,
      status: true,
      prayerCompletedAt: true,
      _count: { select: { attendees: true } },
    },
  });

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <LogoLockup href={`/orgs/${slug}`} />
          <OrgMenu slug={slug} platformAdmin={await isPlatformAdmin()} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-green-brand">
              {ctx.organization.name}
            </p>
            <h1 className="font-display text-3xl font-extrabold text-navy">Trips</h1>
            <div className="mt-2">
              <FreeSetupBadge
                entitlement={ctx.organization.entitlement}
                slug={slug}
                returnTo={`/orgs/${slug}`}
              />
            </div>
          </div>
          <LinkButton href={`/orgs/${slug}/trips/new`}>New trip</LinkButton>
        </div>

        {trips.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No trips yet."
              description="Create your first trip and Ready Set Amen will set up your checklist, forms, and prayer step automatically."
              action={<LinkButton href={`/orgs/${slug}/trips/new`}>Create a trip</LinkButton>}
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {trips.map((trip) => (
              <Card as="li" key={trip.id} className="p-0">
                <Link href={`/orgs/${slug}/trips/${trip.id}`} className="block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold text-navy">{trip.name}</p>
                      <p className="truncate text-sm text-navy-soft">
                        {trip.destination || "Destination not set"}
                      </p>
                      <p className="mt-1 text-sm text-navy-faint">
                        {formatDateRange(trip.startDate, trip.endDate)} ·{" "}
                        {trip._count.attendees}{" "}
                        {trip._count.attendees === 1 ? "person" : "people"}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[trip.status]}>{STATUS_LABEL[trip.status]}</Badge>
                  </div>
                </Link>
              </Card>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <p className="font-display text-base font-bold text-navy">Waiver library</p>
            <p className="mt-1 text-sm text-navy-soft">
              Build reusable waiver templates your church can apply to any trip.
            </p>
            <LinkButton href={`/orgs/${slug}/waivers`} variant="secondary" size="sm" className="mt-3">
              Open waiver library
            </LinkButton>
          </Card>
          <Card className="p-4">
            <p className="font-display text-base font-bold text-navy">Organization settings</p>
            <p className="mt-1 text-sm text-navy-soft">
              Update your church details and see who has access.
            </p>
            <LinkButton href={`/orgs/${slug}/settings`} variant="secondary" size="sm" className="mt-3">
              Open settings
            </LinkButton>
          </Card>
        </div>
      </main>
    </div>
  );
}
