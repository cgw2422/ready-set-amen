/**
 * Giving a church Ready Set Amen for free, and taking it back.
 *
 *   npm run access:grant-org  -- "Grace Community Church" --reason "pilot church"
 *   npm run access:revoke-org -- "Grace Community Church"
 *   npm run access:list-manual
 *
 * A grant is a MANUAL_LIFETIME entitlement plus a MANUAL_GRANT record with the
 * reason and the time attached. No Stripe object is invented, nothing is
 * charged, and because the amount is zero and the source is not
 * STRIPE_CHECKOUT, the platform numbers never read a gift as revenue or as a
 * conversion. Access is live on the church's next request.
 *
 * There is no HTTP route for any of this. The only way in is a shell on the
 * deployment, which is the same bar as changing the database by hand.
 */
import { prisma } from "../src/lib/db";
import {
  grantLifetimeAccess,
  manualLifetimeOrganizations,
  revokeManualAccess,
} from "../src/lib/billing";

const [, , command = "", ...rest] = process.argv;

/** `--reason "..."` and `--by someone@example.com`, in any order. */
function flag(name: string): string | null {
  const index = rest.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = rest[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value.trim();
}

/** Everything that is not a flag or a flag's value: the church. */
function positional(): string {
  const words: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index];
    if (word.startsWith("--")) {
      index += 1; // skip this flag's value
      continue;
    }
    words.push(word);
  }
  return words.join(" ").trim();
}

type Found = { id: string; name: string; slug: string; entitlement: string; isDemo: boolean };

/**
 * Finds one church by id, slug or name — whichever the operator had to hand.
 *
 * An ambiguous name is an error rather than a guess. Granting access to the
 * wrong church is recoverable; revoking from the wrong one is not, and both
 * commands come through here.
 */
async function findOrganization(term: string): Promise<Found> {
  if (!term) {
    throw new Error('Name the church: npm run access:grant-org -- "Grace Community Church" --reason "…"');
  }

  const select = { id: true, name: true, slug: true, entitlement: true, isDemo: true };

  const exact = await prisma.organization.findFirst({
    where: { OR: [{ id: term }, { slug: term }, { name: { equals: term, mode: "insensitive" } }] },
    select,
  });
  if (exact) return exact;

  const partial = await prisma.organization.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    select,
    take: 10,
  });
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) {
    throw new Error(`No church matches "${term}". Try its slug, or npm run access:list-manual.`);
  }

  const lines = partial.map((org) => `    ${org.name}  (${org.slug})`).join("\n");
  throw new Error(`"${term}" matches ${partial.length} churches. Use the slug:\n\n${lines}\n`);
}

function describe(org: Found): string {
  return `${org.name} (${org.slug})`;
}

async function main() {
  switch (command) {
    // -----------------------------------------------------------------------
    case "grant": {
      const org = await findOrganization(positional());
      const reason = flag("reason");
      if (!reason) {
        throw new Error(
          'Say why, so the record means something later:\n\n' +
            `    npm run access:grant-org -- "${org.name}" --reason "pilot church, spoke 3 Sep"\n`,
        );
      }
      if (org.isDemo) {
        throw new Error("The demo church already has access through its DEMO entitlement.");
      }
      if (org.entitlement === "LIFETIME") {
        throw new Error(`${describe(org)} already bought lifetime access. Nothing to grant.`);
      }
      if (org.entitlement === "MANUAL_LIFETIME") {
        console.log(`\n  ${describe(org)} is already on a manual grant.`);
        console.log("  Running this again would record a second grant, so it stopped here.\n");
        return;
      }

      // Optional, and only ever a real account: the column is a user id.
      let grantedBy: string | null = null;
      const by = flag("by");
      if (by) {
        const user = await prisma.user.findUnique({
          where: { email: by.toLowerCase() },
          select: { id: true, email: true },
        });
        if (!user) throw new Error(`No account for ${by}. Leave --by off, or use their real email.`);
        grantedBy = user.id;
      }

      const result = await grantLifetimeAccess({
        organizationId: org.id,
        source: "MANUAL_GRANT",
        entitlement: "MANUAL_LIFETIME",
        amountCents: 0,
        grantReason: reason,
        purchasedByUserId: grantedBy,
      });

      console.log(`\n  Granted lifetime access`);
      console.log(`  ${describe(org)}`);
      console.log(`  Entitlement  ${result.entitlement}`);
      console.log(`  Reason       ${reason}`);
      console.log(`  Granted at   ${new Date().toISOString()}`);
      console.log(`  Granted by   ${by ?? "not recorded (pass --by you@example.com)"}`);
      console.log(`  Recorded as  MANUAL_GRANT · $0.00 · no Stripe purchase`);
      console.log("\n  Every paid feature is open to them on their next request.\n");
      return;
    }

    // -----------------------------------------------------------------------
    case "revoke": {
      const org = await findOrganization(positional());
      const result = await revokeManualAccess(org.id);

      if (result.revoked) {
        console.log(`\n  Revoked the manual grant`);
        console.log(`  ${describe(org)}`);
        console.log(`  Entitlement  ${result.entitlement}`);
        console.log(`  Revoked at   ${new Date().toISOString()}`);
        console.log("\n  Their trips and people are untouched; free-setup limits apply again.");
        console.log("  The original grant stays in the record as history.\n");
        return;
      }

      console.log(`\n  Nothing revoked — ${describe(org)}`);
      switch (result.reason) {
        case "stripe-purchase":
          console.log(`  This church paid through Stripe. A real purchase is never revoked here.`);
          console.log(`  Refund it in Stripe if that is what you mean to do.\n`);
          break;
        case "demo":
          console.log(`  The demo church runs on DEMO, which is not a grant to take back.\n`);
          break;
        default:
          console.log(`  It is on ${result.entitlement}, not a manual grant.\n`);
      }
      process.exitCode = 1;
      return;
    }

    // -----------------------------------------------------------------------
    case "list": {
      const rows = await manualLifetimeOrganizations();
      console.log("");
      if (rows.length === 0) {
        console.log("  No church is on a manual grant.\n");
        return;
      }
      for (const row of rows) {
        const when = row.grantedAt ? row.grantedAt.toISOString().slice(0, 10) : "unknown date";
        console.log(`  ${row.name}  (${row.slug})`);
        console.log(`    Granted   ${when}${row.grantedBy ? ` by ${row.grantedBy}` : ""}`);
        console.log(`    Reason    ${row.reason ?? "none recorded"}`);
        console.log(`    Trips     ${row.trips}`);
        console.log("");
      }
      console.log(`  ${rows.length} church${rows.length === 1 ? "" : "es"} on a manual grant.`);
      console.log("  None of these count as revenue or as a Stripe conversion.\n");
      return;
    }

    default:
      console.error("\n  Use one of:\n");
      console.error('    npm run access:grant-org  -- "Church name" --reason "why"');
      console.error('    npm run access:revoke-org -- "Church name"');
      console.error("    npm run access:list-manual\n");
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
