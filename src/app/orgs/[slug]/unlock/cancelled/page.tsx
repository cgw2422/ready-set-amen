import { requireOrg } from "@/lib/access";
import { Card, LinkButton } from "@/components/ui";
import { LogoLockup } from "@/components/brand";
import { LAUNCH_PRICE } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Still here" };

/** Someone backed out of Checkout. Say so kindly, once, and get out of the way. */
export default async function UnlockCancelledPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  const { next } = await searchParams;
  await requireOrg(slug);
  const backTo = safeNext(next, slug);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8">
      <div className="flex justify-center">
        <LogoLockup href={`/orgs/${slug}`} />
      </div>
      <Card className="mt-6 p-5 text-center">
        <h1 className="font-display text-2xl font-extrabold text-navy">
          No problem — your trip is still here.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-soft">
          Nothing was charged and nothing changed. You can unlock Ready Set Amen for{" "}
          {LAUNCH_PRICE} whenever you&rsquo;re ready.
        </p>
        <LinkButton href={backTo} size="lg" className="mt-6 w-full">
          Back to your trip
        </LinkButton>
      </Card>
    </main>
  );
}

function safeNext(next: string | undefined, slug: string): string {
  const fallback = `/orgs/${slug}`;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next.startsWith(`/orgs/${slug}`) ? next : fallback;
}
