import type { Entitlement } from "@prisma/client";
import { Card, LinkButton } from "@/components/ui";
import { CheckBadge } from "@/components/brand";
import { entitlementLabel, isPaid } from "@/lib/entitlement";
import { formatPrice, LAUNCH_PRICE } from "@/lib/pricing";

/**
 * Access and billing. There is no recurring charge, so there is nothing to
 * manage — no plan to change, no card to update, no portal. This says what the
 * church has and, if they paid, what they paid.
 */
export function AccessCard({
  slug,
  entitlement,
  canBuy,
  purchase,
}: {
  slug: string;
  entitlement: Entitlement;
  canBuy: boolean;
  purchase: {
    source: "STRIPE_CHECKOUT" | "MANUAL_GRANT";
    amountCents: number;
    currency: string;
    purchasedAt: Date;
  } | null;
}) {
  const paid = isPaid(entitlement);

  return (
    <Card className="p-4">
      <p className="font-display text-base font-bold text-navy">Access</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {paid ? <CheckBadge className="h-6 w-6 bg-green-soft text-green-deep" /> : null}
        <p className="font-semibold text-navy">{entitlementLabel(entitlement)}</p>
      </div>

      {paid ? (
        <dl className="mt-3 space-y-1 text-sm text-navy-soft">
          {purchase ? (
            <>
              <div className="flex gap-2">
                <dt className="font-semibold text-navy">Purchased:</dt>
                <dd>
                  {purchase.purchasedAt.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold text-navy">Amount:</dt>
                <dd>
                  {purchase.source === "MANUAL_GRANT"
                    ? "Granted"
                    : formatPrice(purchase.amountCents)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex gap-2">
            <dt className="font-semibold text-navy">Status:</dt>
            <dd>Active</dd>
          </div>
        </dl>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-navy-soft">
            You can set everything up for free. Unlock lifetime access when you&rsquo;re ready to
            send waivers, run headcounts, print packets, and bring in your whole group.
          </p>
          {canBuy ? (
            <LinkButton
              href={`/orgs/${slug}/unlock?next=${encodeURIComponent(`/orgs/${slug}/settings`)}`}
              className="mt-3"
            >
              Unlock lifetime access — {LAUNCH_PRICE}
            </LinkButton>
          ) : (
            <p className="mt-3 text-sm text-navy-faint">
              Your church&rsquo;s owner can unlock this for everyone.
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-xs text-navy-faint">
        One payment, no subscription. Access belongs to the church, so every leader is covered.
      </p>
    </Card>
  );
}
