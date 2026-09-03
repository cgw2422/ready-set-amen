import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/access";
import { checkoutAvailability } from "@/lib/actions/billing";
import { CheckBadge, LogoLockup } from "@/components/brand";
import { Alert, Card, LinkButton } from "@/components/ui";
import { gateCopy, hasFullAccess, isGate } from "@/lib/entitlement";
import { LAUNCH_PRICE } from "@/lib/pricing";
import { UnlockButton } from "./unlock-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unlock Ready Set Amen" };

const INCLUDED = [
  "Unlimited trips",
  "Unlimited attendees",
  "Electronic waiver signing",
  "Mobile headcounts",
  "Vehicle assignments",
  "Room assignments",
  "Payment tracking",
  "Trip packets",
  "Multiple leaders",
  "Future V1 improvements",
];

/**
 * One unlock screen for every paid boundary. The headline and body change to
 * match what the leader was trying to do; the price, the list and the way out
 * never do. There is no urgency, no countdown and no scarcity — the offer is
 * the same today as it will be tomorrow.
 */
export default async function UnlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gate?: string; next?: string; detail?: string }>;
}) {
  const { slug } = await params;
  const { gate: rawGate, next, detail } = await searchParams;
  const ctx = await requireOrg(slug);

  // Already has access: there is nothing to sell, so never show a sales screen.
  if (hasFullAccess(ctx.organization)) redirect(safeNext(next, slug));

  const copy = isGate(rawGate)
    ? gateCopy(rawGate)
    : {
        title: "You're ready for the next step.",
        body: "You've started building your trip. Unlock Ready Set Amen and keep everything together from departure to coming home.",
      };
  const { available } = await checkoutAvailability();
  const backTo = safeNext(next, slug);
  const canBuy = ctx.role === "OWNER";

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <div className="flex justify-center">
        <LogoLockup href={`/orgs/${slug}`} />
      </div>

      <Card className="mt-6 p-5">
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-navy">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-soft">{copy.body}</p>
        {detail ? (
          <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-sm text-navy">{detail}</p>
        ) : null}

        <div className="mt-5 rounded-xl bg-green-tint p-4">
          <p className="font-display text-4xl font-extrabold leading-none text-navy">
            {LAUNCH_PRICE}
          </p>
          <p className="mt-1 font-display text-sm font-extrabold uppercase tracking-tight text-green-deep">
            Lifetime access
          </p>
          <p className="mt-1 text-sm text-navy-soft">One payment. No monthly fee.</p>
        </div>

        <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-navy">
              <CheckBadge className="mt-0.5 h-5 w-5 bg-green-soft text-green-deep" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-6">
          {canBuy ? (
            <UnlockButton
              slug={slug}
              returnTo={backTo}
              disabled={!available}
              label={`Unlock Ready Set Amen — ${LAUNCH_PRICE}`}
            />
          ) : (
            <Alert tone="info" title="Your church owner handles this">
              Ask the owner of {ctx.organization.name} to unlock Ready Set Amen. Once they do,
              everything here opens up for every leader — nobody pays twice.
            </Alert>
          )}
          {canBuy && !available ? (
            <p className="mt-3 text-sm text-navy-faint">
              Payment isn&rsquo;t set up on this deployment yet.
            </p>
          ) : null}
        </div>

        <LinkButton href={backTo} variant="secondary" size="lg" className="mt-3 w-full">
          Keep Setting Up
        </LinkButton>

        <p className="mt-4 text-center text-xs leading-relaxed text-navy-faint">
          Everything you have entered is saved. Nothing is deleted or locked if you decide to wait.
        </p>
      </Card>
    </main>
  );
}

/** Only ever return someone to a page inside their own organization. */
function safeNext(next: string | undefined, slug: string): string {
  const fallback = `/orgs/${slug}`;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next.startsWith(`/orgs/${slug}`) ? next : fallback;
}
