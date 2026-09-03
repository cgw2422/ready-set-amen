import Link from "next/link";
import { prisma } from "@/lib/db";
import { attendeeCount, requireTrip } from "@/lib/access";
import { freeAttendeeSpotsLeft } from "@/lib/entitlement";
import { displayName } from "@/lib/format";
import { Alert, Card, LinkButton } from "@/components/ui";
import { CheckBadge } from "@/components/brand";
import { AttendeeForm, emptyAttendee } from "../attendee-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a person" };

/**
 * Adding one person, and confirming it happened.
 *
 * A successful save redirects back here with the new person's id, which does
 * two things at once: it says plainly who was added, and it guarantees the next
 * form is a brand new page rather than a re-render that might carry over a
 * field, a validation message, or the minor toggle.
 */
export default async function NewAttendeePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ added?: string; saved?: string }>;
}) {
  const { slug, tripId } = await params;
  const { added, saved } = await searchParams;
  const ctx = await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const justAdded = added
    ? await prisma.attendee.findFirst({
        where: { id: added, tripId },
        select: { firstName: true, lastName: true, preferredName: true },
      })
    : null;

  const spotsLeft = freeAttendeeSpotsLeft(ctx.organization, await attendeeCount(ctx));

  if (justAdded) {
    return (
      <div className="space-y-4">
        <Card className="p-5 text-center">
          <div className="flex justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-brand text-white animate-pop">
              <CheckBadge className="h-10 w-10 bg-transparent" />
            </span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-navy">Person added</h1>
          <p className="mt-2 text-navy-soft">
            <span className="font-semibold text-navy">{displayName(justAdded)}</span> was added
            successfully.
          </p>
          {spotsLeft !== null ? (
            <p className="mt-2 text-sm text-navy-faint">
              {spotsLeft === 0
                ? "That is everyone free setup includes."
                : `You can add ${spotsLeft} more ${spotsLeft === 1 ? "person" : "people"} in free setup.`}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <LinkButton href={`${base}/people/new`} size="lg" className="flex-1">
              Add another person
            </LinkButton>
            <LinkButton href={`${base}/people`} variant="secondary" size="lg" className="flex-1">
              Done
            </LinkButton>
          </div>
        </Card>

        <p className="text-center text-sm">
          <Link href={`${base}/people/import`} className="font-semibold text-green-brand underline">
            Import the rest from a spreadsheet
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={`${base}/people`}
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand"
      >
        &lsaquo; Back to people
      </Link>
      <h1 className="font-display text-2xl font-extrabold text-navy">Add a person</h1>
      {saved ? <Alert tone="success">Saved. Add the next person.</Alert> : null}
      <AttendeeForm mode="create" tripId={tripId} values={emptyAttendee} />
    </div>
  );
}
