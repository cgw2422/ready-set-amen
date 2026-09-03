/**
 * Entitlements, purchases and the Stripe webhook.
 *
 * Money and access are the two things that must not be wrong, so these run
 * against a real database: idempotency is a unique-constraint behaviour and
 * "did the second webhook grant access twice" cannot be answered by a mock.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:billing
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/crypto";
import { grantLifetimeAccess, latestPurchase } from "../src/lib/billing";
import {
  FREE_SETUP,
  canAddAttendee,
  canCreateSigningLink,
  canCreateTrip,
  canGenerateTripPacket,
  canInviteLeader,
  canRunHeadcount,
  entitlementLabel,
  freeAttendeeSpotsLeft,
  hasFullAccess,
  unlockPath,
} from "../src/lib/entitlement";
import { LAUNCH_PRICE_CENTS, formatPrice } from "../src/lib/pricing";
import type { Entitlement } from "@prisma/client";

const OWNER_EMAIL = "owner@billing.test";
const FREE_SLUG = "free-church-billing-test";
const PAID_SLUG = "paid-church-billing-test";

let freeOrgId = "";
let paidOrgId = "";
let ownerId = "";

before(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [FREE_SLUG, PAID_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });

  const owner = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      firstName: "Owner",
      lastName: "Test",
      passwordHash: await hashPassword("a strong test password"),
    },
  });
  ownerId = owner.id;

  const free = await prisma.organization.create({
    data: {
      name: "Free Church",
      slug: FREE_SLUG,
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  freeOrgId = free.id;

  const paid = await prisma.organization.create({
    data: {
      name: "Paid Church",
      slug: PAID_SLUG,
      entitlement: "LIFETIME",
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  paidOrgId = paid.id;
});

after(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [FREE_SLUG, PAID_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// What free setup can and cannot do
// ---------------------------------------------------------------------------

test("a new church starts in free setup, not locked and not paid", async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: freeOrgId } });
  assert.equal(org.entitlement, "FREE_SETUP");
  assert.equal(hasFullAccess(org), false);
  assert.equal(entitlementLabel(org.entitlement), "Ready Set Amen Free Setup");
});

test("the three full-access states behave identically at every gate", () => {
  const gates = [
    (org: { entitlement: Entitlement }) => canCreateTrip(org, 1),
    (org: { entitlement: Entitlement }) => canAddAttendee(org, FREE_SETUP.attendees, 1),
    canCreateSigningLink,
    canRunHeadcount,
    canInviteLeader,
    canGenerateTripPacket,
  ];

  for (const gate of gates) {
    assert.equal(gate({ entitlement: "FREE_SETUP" }).allowed, false);
    for (const entitlement of ["LIFETIME", "MANUAL_LIFETIME", "DEMO"] as const) {
      // The showcase church uses the product exactly as a paying one does.
      assert.equal(gate({ entitlement }).allowed, true, entitlement);
    }
  }
});

test("free setup includes exactly one trip", () => {
  const free = { entitlement: "FREE_SETUP" as const };
  assert.equal(canCreateTrip(free, 0).allowed, true);
  const second = canCreateTrip(free, 1);
  assert.equal(second.allowed, false);
  assert.equal(second.allowed === false && second.gate, "second-trip");
  assert.equal(canCreateTrip({ entitlement: "LIFETIME" }, 99).allowed, true);
});

test("free setup includes exactly ten attendees, however they arrive", () => {
  const free = { entitlement: "FREE_SETUP" as const };
  assert.equal(canAddAttendee(free, 0, 10).allowed, true, "ten at once");
  assert.equal(canAddAttendee(free, 6, 4).allowed, true, "six plus four");
  assert.equal(canAddAttendee(free, 9, 1).allowed, true, "the tenth");
  assert.equal(canAddAttendee(free, 10, 1).allowed, false, "the eleventh");
  assert.equal(canAddAttendee(free, 8, 5).allowed, false, "five when two remain");
  assert.equal(canAddAttendee(free, 0, 11).allowed, false, "eleven at once");
  assert.equal(canAddAttendee({ entitlement: "LIFETIME" }, 500, 500).allowed, true);
});

test("the message says how many spots are left, in the words a leader reads", () => {
  const denied = canAddAttendee({ entitlement: "FREE_SETUP" }, 8, 5);
  assert.equal(denied.allowed, false);
  assert.match(
    denied.allowed === false ? (denied.detail ?? "") : "",
    /includes up to 10 attendees.*currently have 8 people.*add 2 more/s,
  );
});

test("spots remaining is reported for free setup and unlimited when paid", () => {
  assert.equal(freeAttendeeSpotsLeft({ entitlement: "FREE_SETUP" }, 8), 2);
  assert.equal(freeAttendeeSpotsLeft({ entitlement: "FREE_SETUP" }, 14), 0, "never negative");
  assert.equal(freeAttendeeSpotsLeft({ entitlement: "DEMO" }, 400), null);
});

test("the unlock link says which gate was hit and where to return", () => {
  const path = unlockPath("my-church", "headcount", "/orgs/my-church/trips/t1/headcount");
  assert.ok(path.startsWith("/orgs/my-church/unlock?"));
  assert.match(path, /gate=headcount/);
  assert.match(path, /next=%2Forgs%2Fmy-church%2Ftrips%2Ft1%2Fheadcount/);
});

// ---------------------------------------------------------------------------
// Granting access
// ---------------------------------------------------------------------------

test("a completed checkout grants lifetime access and records the purchase", async () => {
  const result = await grantLifetimeAccess({
    organizationId: freeOrgId,
    source: "STRIPE_CHECKOUT",
    entitlement: "LIFETIME",
    amountCents: LAUNCH_PRICE_CENTS,
    currency: "usd",
    stripeCheckoutSessionId: "cs_test_billing_1",
    stripePaymentIntentId: "pi_test_billing_1",
    stripeCustomerId: "cus_test_billing_1",
    purchasedByUserId: ownerId,
  });

  assert.equal(result.granted, true);
  assert.equal(result.entitlement, "LIFETIME");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: freeOrgId } });
  assert.equal(org.entitlement, "LIFETIME");

  const purchase = await latestPurchase(freeOrgId);
  assert.equal(purchase?.source, "STRIPE_CHECKOUT");
  assert.equal(purchase?.amountCents, LAUNCH_PRICE_CENTS);
  assert.equal(formatPrice(purchase!.amountCents), "$14.99");
});

test("replaying the same checkout session grants nothing twice", async () => {
  const before = await prisma.purchase.count({ where: { organizationId: freeOrgId } });

  const replay = await grantLifetimeAccess({
    organizationId: freeOrgId,
    source: "STRIPE_CHECKOUT",
    entitlement: "LIFETIME",
    amountCents: LAUNCH_PRICE_CENTS,
    stripeCheckoutSessionId: "cs_test_billing_1",
  });

  assert.equal(replay.granted, false, "a redelivered webhook must be a no-op");
  assert.equal(await prisma.purchase.count({ where: { organizationId: freeOrgId } }), before);
});

test("a manual grant is never recorded as a Stripe purchase", async () => {
  const org = await prisma.organization.create({
    data: { name: "Pilot Church", slug: `${FREE_SLUG}-pilot` },
  });

  await grantLifetimeAccess({
    organizationId: org.id,
    source: "MANUAL_GRANT",
    entitlement: "MANUAL_LIFETIME",
    amountCents: 0,
    grantReason: "pilot church",
  });

  const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
  assert.equal(updated.entitlement, "MANUAL_LIFETIME");

  const purchase = await latestPurchase(org.id);
  assert.equal(purchase?.source, "MANUAL_GRANT");
  assert.equal(purchase?.amountCents, 0);
  assert.equal(purchase?.grantReason, "pilot church");

  await prisma.organization.delete({ where: { id: org.id } });
});

test("a payment never converts the demo church away from its DEMO entitlement", async () => {
  const demo = await prisma.organization.create({
    data: { name: "Demo For Billing", slug: `${FREE_SLUG}-demo`, isDemo: true, entitlement: "DEMO" },
  });

  await grantLifetimeAccess({
    organizationId: demo.id,
    source: "STRIPE_CHECKOUT",
    entitlement: "LIFETIME",
    amountCents: LAUNCH_PRICE_CENTS,
    stripeCheckoutSessionId: "cs_test_billing_demo",
  });

  const after_ = await prisma.organization.findUniqueOrThrow({ where: { id: demo.id } });
  assert.equal(after_.entitlement, "DEMO", "the showcase is not converted by a payment");

  await prisma.organization.delete({ where: { id: demo.id } });
});

test("a second purchase does not downgrade a church that already paid", async () => {
  await grantLifetimeAccess({
    organizationId: paidOrgId,
    source: "MANUAL_GRANT",
    entitlement: "MANUAL_LIFETIME",
    amountCents: 0,
    grantReason: "support case",
  });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: paidOrgId } });
  assert.equal(org.entitlement, "LIFETIME", "an existing paid entitlement is kept");
});

test("purchases belong to one organization and never leak into another", async () => {
  const theirs = await prisma.purchase.findMany({ where: { organizationId: paidOrgId } });
  for (const purchase of theirs) {
    assert.equal(purchase.organizationId, paidOrgId);
  }
  const mine = await prisma.purchase.count({ where: { organizationId: freeOrgId } });
  assert.ok(mine > 0);
  const crossed = await prisma.purchase.count({
    where: { organizationId: freeOrgId, id: { in: theirs.map((p) => p.id) } },
  });
  assert.equal(crossed, 0);
});

test("deleting an organization takes its purchase history with it", async () => {
  const org = await prisma.organization.create({
    data: { name: "Temp Church", slug: `${FREE_SLUG}-temp` },
  });
  await grantLifetimeAccess({
    organizationId: org.id,
    source: "MANUAL_GRANT",
    entitlement: "MANUAL_LIFETIME",
    amountCents: 0,
  });
  await prisma.organization.delete({ where: { id: org.id } });
  assert.equal(await prisma.purchase.count({ where: { organizationId: org.id } }), 0);
});

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/** Builds the header Stripe sends, so the real verifier can be exercised. */
function signedHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("the webhook verifier accepts a correctly signed payload", async () => {
  process.env.STRIPE_SECRET_KEY ??= "sk_test_billing";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing_test";
  const { verifyWebhook } = await import("../src/lib/stripe");

  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: {} });
  const event = verifyWebhook(payload, signedHeader(payload, "whsec_billing_test"));
  assert.equal(event.id, "evt_1");
});

test("the webhook verifier rejects a forged or tampered payload", async () => {
  process.env.STRIPE_SECRET_KEY ??= "sk_test_billing";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing_test";
  const { verifyWebhook } = await import("../src/lib/stripe");

  const payload = JSON.stringify({ id: "evt_2", type: "checkout.session.completed", data: {} });
  const header = signedHeader(payload, "whsec_billing_test");

  // Same signature, different body — the classic replay-with-edits attempt.
  const tampered = JSON.stringify({ id: "evt_2", type: "checkout.session.completed", data: { x: 1 } });
  assert.throws(() => verifyWebhook(tampered, header));

  // Right body, signed with a secret we do not share.
  assert.throws(() => verifyWebhook(payload, signedHeader(payload, "whsec_not_ours")));

  // No header at all.
  assert.throws(() => verifyWebhook(payload, null));
});

test("an old signature is rejected once it falls outside Stripe's tolerance", async () => {
  process.env.STRIPE_SECRET_KEY ??= "sk_test_billing";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing_test";
  const { verifyWebhook } = await import("../src/lib/stripe");

  const payload = JSON.stringify({ id: "evt_3", type: "checkout.session.completed", data: {} });
  const ancient = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
  assert.throws(() => verifyWebhook(payload, signedHeader(payload, "whsec_billing_test", ancient)));
});

// ---------------------------------------------------------------------------
// The price is decided on the server
// ---------------------------------------------------------------------------

test("no browser input can influence what a church is charged", async () => {
  const { readFileSync } = await import("node:fs");
  const checkout = readFileSync("src/lib/actions/billing.ts", "utf8");

  // The line item comes from the pricing module, never from the form data.
  assert.ok(checkout.includes("lineItem()"), "checkout builds its line item on the server");
  assert.ok(
    !/formData|searchParams|request\./.test(checkout),
    "the checkout action reads no untrusted input for the amount",
  );

  const stripeModule = readFileSync("src/lib/stripe.ts", "utf8");
  assert.ok(stripeModule.includes("LAUNCH_PRICE_CENTS"));
  assert.ok(
    !/unit_amount:\s*(?!LAUNCH_PRICE_CENTS)[a-z]/.test(stripeModule),
    "the amount is the pricing constant, not a variable from elsewhere",
  );
});

test("the success page never grants access on its own", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/app/orgs/[slug]/unlock/success/page.tsx", "utf8");
  assert.ok(
    !/grantLifetimeAccess|prisma\.organization\.update/.test(page),
    "returning from Stripe must not be what grants access",
  );
});

test("there is no HTTP route that grants access without a Stripe signature", async () => {
  const { readdirSync, statSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  const granting = walk("src/app")
    .filter((f) => /route\.ts$/.test(f))
    .filter((f) => readFileSync(f, "utf8").includes("grantLifetimeAccess"));

  assert.deepEqual(
    granting,
    ["src/app/api/stripe/webhook/route.ts"],
    "only the signature-checked webhook may grant access",
  );

  const webhook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  assert.ok(webhook.includes("verifyWebhook"), "the webhook verifies its signature");
  assert.ok(webhook.includes('payment_status !== "paid"'), "and only acts on a paid session");
});
