import Link from "next/link";
import { requireOrg, requireTripCapacity } from "@/lib/access";
import { NewTripForm } from "./new-trip-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New trip" };

export default async function NewTripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  // Send them to the unlock screen rather than to a form that cannot save.
  await requireTripCapacity(ctx, `/orgs/${slug}`);

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <Link href={`/orgs/${slug}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand">
        &lsaquo; Back to trips
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold text-navy">Create a trip</h1>
      <p className="mt-1 text-navy-soft">
        You can change any of this later. We&rsquo;ll set up your preparation checklist, common
        forms, and leader roles automatically.
      </p>
      <NewTripForm slug={slug} />
    </main>
  );
}
