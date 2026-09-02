import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { formatDateRange } from "@/lib/format";
import { TripTabBar } from "@/components/trip-nav";
import { TripSidebar } from "@/components/trip-sidebar";
import { OrgMenu } from "@/components/org-menu";
import { CheckBadge } from "@/components/brand";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { id: true, name: true, destination: true, startDate: true, endDate: true },
  });

  const base = `/orgs/${slug}/trips/${tripId}`;

  return (
    <div className="min-h-dvh bg-cream">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur print-hide">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href={`/orgs/${slug}`}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-line text-navy"
            aria-label="Back to trips"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link href={base} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center">
            <p className="truncate font-display text-base font-bold leading-tight text-navy">
              {trip.name}
            </p>
            <p className="truncate text-xs text-navy-soft">
              {[trip.destination, formatDateRange(trip.startDate, trip.endDate)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
          <CheckBadge className="hidden h-8 w-8 sm:inline-flex" />
          <OrgMenu slug={slug} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-0 lg:px-4">
        <TripSidebar base={base} />
        <main className="min-w-0 flex-1 px-4 pb-32 pt-4 lg:px-0 lg:pb-12">{children}</main>
      </div>

      <TripTabBar base={base} />
    </div>
  );
}
