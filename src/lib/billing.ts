import "server-only";
import type { Entitlement, PurchaseSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPaid } from "@/lib/entitlement";

/**
 * Granting access, in one place, exactly once.
 *
 * Stripe delivers webhooks at least once, retries on any non-2xx, and can send
 * the same event again days later. So the write has to be safe to repeat: the
 * Checkout session id is unique in the database, and a replay finds the row
 * already there and changes nothing rather than recording a second purchase or
 * re-granting access.
 */

export type GrantResult = {
  /** False when this exact purchase had already been recorded. */
  granted: boolean;
  organizationId: string;
  entitlement: Entitlement;
};

export async function grantLifetimeAccess(input: {
  organizationId: string;
  source: PurchaseSource;
  entitlement: Extract<Entitlement, "LIFETIME" | "MANUAL_LIFETIME">;
  amountCents: number;
  currency?: string;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  purchasedByUserId?: string | null;
  grantReason?: string | null;
}): Promise<GrantResult> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, entitlement: true },
  });
  if (!organization) throw new Error("That organization no longer exists.");

  if (input.stripeCheckoutSessionId) {
    const seen = await prisma.purchase.findUnique({
      where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
      select: { id: true },
    });
    if (seen) {
      return { granted: false, organizationId: organization.id, entitlement: organization.entitlement };
    }
  }

  // The demo church is never converted by a payment, and a church that already
  // owns lifetime access keeps the entitlement it has; the purchase is still
  // recorded so support can see what happened.
  const keepExisting = organization.entitlement === "DEMO" || isPaid(organization.entitlement);

  const [, updated] = await prisma.$transaction([
    prisma.purchase.create({
      data: {
        organizationId: organization.id,
        source: input.source,
        entitlement: input.entitlement,
        amountCents: input.amountCents,
        currency: input.currency ?? "usd",
        stripeCustomerId: input.stripeCustomerId ?? null,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        stripeProductId: input.stripeProductId ?? null,
        stripePriceId: input.stripePriceId ?? null,
        purchasedByUserId: input.purchasedByUserId ?? null,
        grantReason: input.grantReason ?? null,
      },
    }),
    prisma.organization.update({
      where: { id: organization.id },
      data: keepExisting ? {} : { entitlement: input.entitlement },
      select: { entitlement: true },
    }),
  ]);

  return { granted: true, organizationId: organization.id, entitlement: updated.entitlement };
}

/** The most recent purchase, for the billing section. */
export async function latestPurchase(organizationId: string) {
  return prisma.purchase.findFirst({
    where: { organizationId },
    orderBy: { purchasedAt: "desc" },
    select: {
      id: true,
      source: true,
      amountCents: true,
      currency: true,
      purchasedAt: true,
      grantReason: true,
    },
  });
}
