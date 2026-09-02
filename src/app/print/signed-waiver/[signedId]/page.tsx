import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SignedWaiverDocument } from "@/components/signed-waiver-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signed waiver" };

export default async function PrintSignedWaiverPage({
  params,
}: {
  params: Promise<{ signedId: string }>;
}) {
  const { signedId } = await params;
  const user = await requireUser();

  // Resolved through organization membership, never by id alone.
  const record = await prisma.signedWaiver.findFirst({
    where: {
      id: signedId,
      attendee: { trip: { organization: { members: { some: { userId: user.id } } } } },
    },
    include: {
      responses: { orderBy: { fieldLabel: "asc" } },
      attendee: {
        select: { trip: { select: { name: true, organization: { select: { name: true } } } } },
      },
    },
  });
  if (!record) notFound();

  return (
    <SignedWaiverDocument
      record={record}
      tripName={record.attendee.trip.name}
      organizationName={record.attendee.trip.organization.name}
    />
  );
}
