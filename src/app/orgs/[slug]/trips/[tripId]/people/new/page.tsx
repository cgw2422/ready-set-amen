import Link from "next/link";
import { requireTrip } from "@/lib/access";
import { Alert } from "@/components/ui";
import { AttendeeForm, emptyAttendee } from "../attendee-form";

export const metadata = { title: "Add a person" };

export default async function NewAttendeePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { slug, tripId } = await params;
  const { added } = await searchParams;
  await requireTrip(tripId);

  return (
    <div className="space-y-4">
      <Link href={`/orgs/${slug}/trips/${tripId}/people`} className="text-sm font-semibold text-green-brand">
        &lsaquo; Back to people
      </Link>
      <h1 className="font-display text-2xl font-extrabold text-navy">Add a person</h1>
      {added ? <Alert tone="success">Saved. Add the next person.</Alert> : null}
      <AttendeeForm mode="create" tripId={tripId} values={emptyAttendee} />
    </div>
  );
}
