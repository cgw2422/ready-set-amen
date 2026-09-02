import Link from "next/link";
import { requireTrip } from "@/lib/access";
import { QuickAddForm } from "./quick-add-form";

export const metadata = { title: "Quick add people" };

export default async function QuickAddPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  return (
    <div className="space-y-4">
      <Link href={`/orgs/${slug}/trips/${tripId}/people`} className="text-sm font-semibold text-green-brand">
        &lsaquo; Back to people
      </Link>
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Quick add</h1>
        <p className="mt-1 text-sm text-navy-soft">
          Paste your roster — one person per line. Getting 40 names in takes about a minute; you can
          fill in the details later.
        </p>
      </div>
      <QuickAddForm tripId={tripId} />
    </div>
  );
}
