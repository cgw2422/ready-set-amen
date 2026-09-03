/**
 * Grant lifetime access by hand, from a shell — for a pilot church, a
 * complimentary account, or a support case where a payment went wrong.
 *
 *   npm run grant -- <organization-slug> "why"
 *   npm run grant:status -- <organization-slug>
 *
 * There is no admin panel and no HTTP route for this. A grant is recorded as
 * MANUAL_GRANT with the reason attached, so nothing ever reads a gift as
 * revenue and support can always see how a church got its access.
 */
import { prisma } from "../src/lib/db";
import { grantLifetimeAccess, latestPurchase } from "../src/lib/billing";
import { formatPrice } from "../src/lib/pricing";

const command = process.argv[2] ?? "";
const slug = process.argv[3] ?? "";
const reason = process.argv.slice(4).join(" ").trim();

async function organization(orgSlug: string) {
  if (!orgSlug) throw new Error("Pass an organization slug.");
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, entitlement: true, isDemo: true },
  });
  if (!org) throw new Error(`No organization with slug "${orgSlug}".`);
  return org;
}

async function main() {
  switch (command) {
    case "status": {
      const org = await organization(slug);
      const purchase = await latestPurchase(org.id);
      console.log(`\n  ${org.name} (${org.slug})`);
      console.log(`  Entitlement  ${org.entitlement}`);
      if (purchase) {
        console.log(`  Last record  ${purchase.source} · ${formatPrice(purchase.amountCents)}`);
        console.log(`               ${purchase.purchasedAt.toISOString()}`);
        if (purchase.grantReason) console.log(`               ${purchase.grantReason}`);
      } else {
        console.log("  Last record  none");
      }
      console.log("");
      return;
    }

    case "grant": {
      const org = await organization(slug);
      if (!reason) throw new Error('Say why: npm run grant -- <slug> "pilot church, spoke 3 Sep".');
      if (org.isDemo) {
        throw new Error("The demo organization already has access through its DEMO entitlement.");
      }

      const result = await grantLifetimeAccess({
        organizationId: org.id,
        source: "MANUAL_GRANT",
        entitlement: "MANUAL_LIFETIME",
        amountCents: 0,
        grantReason: reason,
      });

      console.log(`\n  ${org.name} (${org.slug})`);
      console.log(`  Entitlement  ${result.entitlement}`);
      console.log(`  Reason       ${reason}`);
      console.log("\n  Recorded as a manual grant, not a purchase.\n");
      return;
    }

    default:
      console.error('Use: grant | status.  e.g. npm run grant -- my-church "pilot"');
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
