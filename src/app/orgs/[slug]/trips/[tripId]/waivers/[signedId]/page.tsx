import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { Card } from "@/components/ui";
import { SignedWaiverDocument } from "@/components/signed-waiver-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signed waiver" };

export default async function SignedWaiverPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string; signedId: string }>;
}) {
  const { slug, tripId, signedId } = await params;
  const ctx = await requireTrip(tripId);

  const record = await prisma.signedWaiver.findFirst({
    where: { id: signedId, attendee: { tripId } },
    include: { responses: { orderBy: { fieldLabel: "asc" } } },
  });
  if (!record) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/orgs/${slug}/trips/${tripId}/waivers`}
          className="text-sm font-semibold text-green-brand"
        >
          &lsaquo; Back to waivers
        </Link>
        <Link
          href={`/print/signed-waiver/${record.id}`}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-green-brand px-4 text-[15px] font-semibold text-white"
        >
          Print / save as PDF
        </Link>
      </div>

      <Card className="p-5">
        <SignedWaiverDocument
          record={record}
          tripName={ctx.trip.name}
          organizationName={ctx.organization.name}
        />
      </Card>
    </div>
  );
}
