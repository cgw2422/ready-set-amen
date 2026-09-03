/**
 * What Ready Set Amen costs, in one place.
 *
 * The launch price is the amount Checkout charges, so it is expressed in cents
 * and every display string is derived from it — a marketing page and a Stripe
 * session can never disagree about the number. The price the customer pays is
 * always read from here on the server; a browser never sends an amount.
 */

export const LAUNCH_PRICE_CENTS = 1499;
export const REGULAR_PRICE_CENTS = 3900;
export const CURRENCY = "usd";

export const PRODUCT_NAME = "Ready Set Amen Lifetime Access";
export const PRODUCT_DESCRIPTION =
  "One-time payment for lifetime access to Ready Set Amen for your church. No subscription.";

export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

export const LAUNCH_PRICE = formatPrice(LAUNCH_PRICE_CENTS);
export const REGULAR_PRICE = formatPrice(REGULAR_PRICE_CENTS);
