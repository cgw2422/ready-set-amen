import { requireOrg } from "@/lib/access";
import { CheckBadge, Confetti, Wordmark } from "@/components/brand";
import { Card, LinkButton } from "@/components/ui";
import { hasFullAccess } from "@/lib/entitlement";

export const dynamic = "force-dynamic";
export const metadata = { title: "You're all set" };

/**
 * Where Stripe returns the buyer. It reports what the database says — this page
 * never grants anything, because anyone can open it. If the webhook has not
 * landed in the second or two since payment, it says so plainly rather than
 * claiming an activation that has not happened.
 */
export default async function UnlockSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { slug } = await params;
  const { next } = await searchParams;
  const ctx = await requireOrg(slug);
  const active = hasFullAccess(ctx.organization);
  const backTo = safeNext(next, slug);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-10 text-center">
      <div className="relative">
        {active ? (
          <Confetti className="pointer-events-none absolute inset-x-0 -top-2 h-14 w-full" />
        ) : null}
        <div className="relative flex justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-brand text-white animate-pop">
            <CheckBadge className="h-12 w-12 bg-transparent" />
          </span>
        </div>
      </div>

      {active ? (
        <>
          <div className="mt-6 flex justify-center">
            <Wordmark size="md" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold text-navy">
            You&rsquo;ve unlocked Ready Set Amen for life.
          </h1>
          <p className="mt-2 text-navy-soft">Your trip is right where you left it.</p>
        </>
      ) : (
        <>
          <h1 className="mt-6 font-display text-2xl font-extrabold text-navy">
            Thank you — your payment is going through.
          </h1>
          <p className="mt-2 text-navy-soft">
            Stripe confirms payments to us in the background, which usually takes a few seconds.
            Refresh this page in a moment and everything will be open.
          </p>
          <Card className="mt-5 p-4 text-left text-sm text-navy-soft">
            Nothing you entered is affected either way, and you will not be charged twice.
          </Card>
        </>
      )}

      <LinkButton href={backTo} size="lg" className="mt-8 w-full">
        Continue Planning
      </LinkButton>
    </main>
  );
}

function safeNext(next: string | undefined, slug: string): string {
  const fallback = `/orgs/${slug}`;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next.startsWith(`/orgs/${slug}`) ? next : fallback;
}
