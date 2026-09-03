import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantLifetimeAccess } from "@/lib/billing";
import { verifyWebhook, webhookConfigured } from "@/lib/stripe";

/**
 * The only place a payment turns into access.
 *
 * The browser's return from Checkout proves nothing — anyone can open the
 * success URL — so it never grants anything. Access is granted here, from an
 * event whose signature Stripe signed, and only after Stripe says the session
 * is paid.
 *
 * Stripe retries any non-2xx and can redeliver an old event at any time, so
 * this has to be safe to run twice: the checkout session id is unique in the
 * database and a replay is recorded as "already handled" rather than as a
 * second purchase.
 */

export const runtime = "nodejs";
// The signature is computed over the exact bytes Stripe sent; nothing may parse
// or re-serialize the body before it is verified.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!webhookConfigured()) {
    // Deliberately not an error: a deployment without Stripe configured should
    // reject the call plainly rather than look like a broken endpoint.
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(raw, request.headers.get("stripe-signature"));
  } catch {
    // Never echo the reason: a forged request should learn nothing about why it
    // failed, and the body is attacker-controlled.
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledged so Stripe stops retrying events this app does not act on.
    return NextResponse.json({ received: true, handled: false });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, handled: false, reason: "unpaid" });
  }

  const organizationId = session.metadata?.organizationId ?? session.client_reference_id ?? null;
  if (!organizationId) {
    // Nothing to grant against. Acknowledge so it is not retried forever; the
    // purchase is visible in Stripe for whoever needs to reconcile it.
    return NextResponse.json({ received: true, handled: false, reason: "no organization" });
  }

  try {
    const result = await grantLifetimeAccess({
      organizationId,
      source: "STRIPE_CHECKOUT",
      entitlement: "LIFETIME",
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripePriceId: process.env.STRIPE_PRICE_ID ?? null,
      purchasedByUserId: session.metadata?.purchasedByUserId ?? null,
    });
    return NextResponse.json({ received: true, handled: true, granted: result.granted });
  } catch {
    // A real failure — the database was unreachable, say. Return 500 so Stripe
    // retries; the idempotency guard makes that safe.
    return NextResponse.json({ error: "Could not record the purchase." }, { status: 500 });
  }
}
