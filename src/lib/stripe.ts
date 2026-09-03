import "server-only";
import Stripe from "stripe";
import { CURRENCY, LAUNCH_PRICE_CENTS, PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/pricing";

/**
 * Stripe, kept behind one module.
 *
 * Two rules this file exists to keep:
 *
 *   1. The price is decided here, on the server, from `@/lib/pricing`. Nothing
 *      a browser sends is ever used to build a Checkout session, so a modified
 *      request cannot change what a church is charged.
 *   2. Card details never reach this application. Checkout is hosted by Stripe;
 *      what comes back is an identifier and a paid/unpaid answer.
 *
 * The app runs without Stripe configured — that is how the demo, the test
 * suites, and any deployment that has not set keys yet behave. Nothing crashes;
 * the unlock page simply explains that purchasing is not available.
 */

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!client) client = new Stripe(key);
  return client;
}

/** What the customer is charged. Always read from the server, never the form. */
export function lineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
  // A price id, when one is configured in the Stripe dashboard, keeps the
  // product and receipts tidy. Without one, the price is built inline from the
  // same constants the marketing page renders, so the two can never disagree.
  const priceId = process.env.STRIPE_PRICE_ID;
  if (priceId) return { price: priceId, quantity: 1 };

  return {
    quantity: 1,
    price_data: {
      currency: CURRENCY,
      unit_amount: LAUNCH_PRICE_CENTS,
      product_data: { name: PRODUCT_NAME, description: PRODUCT_DESCRIPTION },
    },
  };
}

/**
 * Verifies that a webhook really came from Stripe. The raw body must be the
 * exact bytes Stripe sent — parsing it first would change the signature.
 */
export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signature) throw new Error("Missing Stripe-Signature header.");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
