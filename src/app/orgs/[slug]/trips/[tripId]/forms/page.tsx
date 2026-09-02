import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { displayName } from "@/lib/format";
import { Alert, Card } from "@/components/ui";
import { FormsMatrix } from "./forms-matrix";
import { AddRequirementForm } from "./add-requirement";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forms" };

export default async function FormsPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  const [requirements, attendees] = await Promise.all([
    prisma.documentRequirement.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, description: true, required: true },
    }),
    prisma.attendee.findMany({
      where: { tripId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        documentStatuses: { select: { requirementId: true, status: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Forms</h1>
        <p className="text-sm text-navy-soft">
          Track everything that isn&rsquo;t the digital waiver — insurance cards, passports,
          conference registrations, permission slips.
        </p>
      </div>

      <Alert tone="info">
        Waivers are signed electronically inside Ready Set Amen. Everything here is a simple
        complete / missing checklist — tap a cell to change it.{" "}
        <Link href={`/orgs/${slug}/trips/${tripId}/waivers`} className="font-semibold underline">
          Go to waivers
        </Link>
      </Alert>

      <Card className="p-4">
        <AddRequirementForm tripId={tripId} />
      </Card>

      <FormsMatrix
        requirements={requirements}
        attendees={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          statuses: Object.fromEntries(
            a.documentStatuses.map((s) => [s.requirementId, s.status]),
          ) as Record<string, "MISSING" | "COMPLETE" | "NOT_REQUIRED">,
        }))}
      />

      <Link
        href={`/print/trip/${tripId}/missing-forms`}
        className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
      >
        Print missing forms
      </Link>
    </div>
  );
}
