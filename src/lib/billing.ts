import "server-only";
import type { Entitlement, PurchaseSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasFullAccess } from "@/lib/entitlement";

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
  const keepExisting =
    organization.entitlement === "DEMO" || hasFullAccess(organization);

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

export type RevokeResult =
  | { revoked: true; entitlement: "FREE_SETUP" }
  | { revoked: false; reason: "not-manual" | "stripe-purchase" | "demo"; entitlement: Entitlement };

/**
 * Takes back a manual grant, and nothing else.
 *
 * The refusals are the point of this function. A church that actually paid must
 * never lose access to a mistyped command, so a real Stripe purchase is checked
 * for first and wins over whatever the entitlement column currently says. The
 * demo church runs on DEMO and is not a grant to take back.
 *
 * The original grant row stays exactly where it is. Purchases are append-only
 * history — "this church was given access on the 3rd, and it was withdrawn
 * later" is the true story, and deleting the row would tell a different one.
 */
export async function revokeManualAccess(organizationId: string): Promise<RevokeResult> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      entitlement: true,
      isDemo: true,
      purchases: {
        where: { source: "STRIPE_CHECKOUT" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!organization) throw new Error("That organization no longer exists.");

  if (organization.purchases.length > 0) {
    return { revoked: false, reason: "stripe-purchase", entitlement: organization.entitlement };
  }
  if (organization.isDemo || organization.entitlement === "DEMO") {
    return { revoked: false, reason: "demo", entitlement: organization.entitlement };
  }
  if (organization.entitlement !== "MANUAL_LIFETIME") {
    return { revoked: false, reason: "not-manual", entitlement: organization.entitlement };
  }

  const updated = await prisma.organization.update({
    where: { id: organization.id },
    data: { entitlement: "FREE_SETUP" },
    select: { entitlement: true },
  });
  return { revoked: true, entitlement: updated.entitlement as "FREE_SETUP" };
}

/** Every church currently running on a manual grant, newest grant first. */
export async function manualLifetimeOrganizations() {
  const organizations = await prisma.organization.findMany({
    where: { entitlement: "MANUAL_LIFETIME" },
    select: {
      id: true,
      name: true,
      slug: true,
      isDemo: true,
      createdAt: true,
      purchases: {
        where: { source: "MANUAL_GRANT" },
        orderBy: { purchasedAt: "desc" },
        take: 1,
        select: { purchasedAt: true, grantReason: true, purchasedByUserId: true },
      },
      _count: { select: { trips: true } },
    },
  });

  // purchasedByUserId is a plain column, not a relation — the operator may have
  // been removed since, and a grant must outlive the person who made it.
  const operatorIds = organizations
    .map((organization) => organization.purchases[0]?.purchasedByUserId)
    .filter((id): id is string => Boolean(id));
  const operators = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, email: true },
      })
    ).map((user) => [user.id, user.email]),
  );

  return organizations
    .map((organization) => {
      const grant = organization.purchases[0];
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isDemo: organization.isDemo,
        trips: organization._count.trips,
        grantedAt: grant?.purchasedAt ?? null,
        reason: grant?.grantReason ?? null,
        grantedBy: grant?.purchasedByUserId ? (operators.get(grant.purchasedByUserId) ?? null) : null,
      };
    })
    .sort((a, b) => (b.grantedAt?.getTime() ?? 0) - (a.grantedAt?.getTime() ?? 0));
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
