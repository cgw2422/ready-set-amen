"use server";

import { redirect } from "next/navigation";
import { requireOrgOwner } from "@/lib/access";
import { appOrigin } from "@/lib/hosts";
import { CURRENCY, LAUNCH_PRICE_CENTS } from "@/lib/pricing";
import { lineItem, stripe, stripeEnabled } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/actions/auth";

/**
 * Starts a hosted Stripe Checkout session for one organization.
 *
 * Everything that decides what is bought and who it is for is resolved here:
 * `requireOrgOwner` proves the caller owns the slug they named, the price comes
 * from the server, and the organization id is written into the session metadata
 * rather than accepted from the browser. A modified request can only ever buy
 * lifetime access, at the real price, for an organization the caller already
 * owns.
 */
export async function startCheckoutAction(slug: string, returnTo?: string): Promise<FormState> {
  const ctx = await requireOrgOwner(slug);

  if (!stripeEnabled()) {
    return {
      error:
        "Payment is not set up on this deployment yet. Ask whoever runs it to add the Stripe keys.",
    };
  }

  const limit = await rateLimit(`checkout:${ctx.organization.id}`, 20, 60 * 60_000);
  if (!limit.allowed) {
    return { error: "That's a lot of checkout attempts. Please try again shortly." };
  }

  const origin = appOrigin();
  const next = safeReturnTo(returnTo, ctx.organization.slug);

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [lineItem()],
    // Stripe echoes this back on the webhook; it is how the payment finds the
    // organization. It is set from the resolved membership, never from input.
    metadata: {
      organizationId: ctx.organization.id,
      organizationSlug: ctx.organization.slug,
      purchasedByUserId: ctx.userId,
    },
    payment_intent_data: {
      metadata: { organizationId: ctx.organization.id },
    },
    client_reference_id: ctx.organization.id,
    success_url: `${origin}/orgs/${slug}/unlock/success?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(next)}`,
    cancel_url: `${origin}/orgs/${slug}/unlock/cancelled?next=${encodeURIComponent(next)}`,
    allow_promotion_codes: false,
  });

  if (!session.url) return { error: "Stripe did not return a checkout page. Please try again." };
  redirect(session.url);
}

/** Only ever send someone back inside their own organization. */
function safeReturnTo(returnTo: string | undefined, slug: string): string {
  const fallback = `/orgs/${slug}`;
  if (!returnTo) return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo.startsWith(`/orgs/${slug}`) ? returnTo : fallback;
}

/** What the unlock screen shows about the price, without importing Stripe. */
export async function checkoutAvailability(): Promise<{
  available: boolean;
  amountCents: number;
  currency: string;
}> {
  return { available: stripeEnabled(), amountCents: LAUNCH_PRICE_CENTS, currency: CURRENCY };
}
