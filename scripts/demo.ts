/**
 * Demo organization admin CLI.
 *
 * Deliberately a command, not an HTTP endpoint. A "reset demo" route — even an
 * authenticated one — is a destructive button reachable from the internet, and
 * this one wipes fifty people and their signed waivers. Running it requires
 * shell access to the deployment.
 *
 *   npm run demo:status
 *   npm run demo:seed        # first time only
 *   npm run demo:reset       # rebuild to the pristine showcase state
 *   npm run demo:password    # set a new password for the demo login
 *
 * The password comes from DEMO_PASSWORD. If it is not set, seed and reset
 * generate one and print it once — to your terminal, never to a log file and
 * never into the repository.
 */
import { prisma } from "../src/lib/db";
import {
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_OWNER_EMAIL,
} from "../src/lib/demo/constants";
import {
  findDemoOrganization,
  resetDemoOrganization,
  seedDemoOrganization,
  setDemoPassword,
  type DemoSeedResult,
} from "../src/lib/demo/seed";

const command = process.argv[2] ?? "status";

function baseUrl(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "http://localhost:3000";
}

function report(result: DemoSeedResult) {
  console.log("");
  console.log(`  ${DEMO_ORG_NAME}`);
  console.log(`  ${result.tripName}`);
  console.log("");
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`    ${key.padEnd(20)} ${value}`);
  }
  console.log("");
  console.log(`  Sign in at  ${baseUrl()}/login`);
  console.log(`  Email       ${result.ownerEmail}`);
  if (result.generatedPassword) {
    console.log(`  Password    ${result.generatedPassword}`);
    console.log("");
    console.log("  ^ Generated because DEMO_PASSWORD was not set. Save it now — it is not stored");
    console.log("    anywhere in readable form and will not be shown again.");
  } else {
    console.log("  Password    (the value of DEMO_PASSWORD)");
  }
  console.log("");
  console.log(`  Trip        ${baseUrl()}/orgs/${result.organizationSlug}/trips/${result.tripId}`);
  console.log("");
}

async function main() {
  switch (command) {
    case "status": {
      const demo = await findDemoOrganization();
      if (!demo) {
        console.log(`No demo organization. Run: npm run demo:seed`);
        return;
      }
      const trip = await prisma.trip.findFirst({
        where: { organizationId: demo.id },
        select: { id: true, name: true, _count: { select: { attendees: true } } },
      });
      console.log(`Demo organization present (isDemo=${demo.isDemo}).`);
      console.log(`  ${trip?.name ?? "no trip"} — ${trip?._count.attendees ?? 0} people`);
      console.log(`  ${baseUrl()}/orgs/${DEMO_ORG_SLUG}`);
      return;
    }

    case "seed": {
      const result = await seedDemoOrganization({ password: process.env.DEMO_PASSWORD });
      console.log("Demo organization created.");
      report(result);
      return;
    }

    case "reset": {
      const existing = await findDemoOrganization();
      // Refuse to guess: if DEMO_PASSWORD is unset on a reset we generate a new
      // one rather than silently leaving the old (now deleted) credentials.
      const result = await resetDemoOrganization({ password: process.env.DEMO_PASSWORD });
      console.log(existing ? "Demo organization rebuilt." : "Demo organization created.");
      report(result);
      return;
    }

    case "password": {
      const password = process.env.DEMO_PASSWORD ?? process.argv[3];
      if (!password || password.length < 10) {
        console.error("Set DEMO_PASSWORD (at least 10 characters) or pass it as an argument.");
        process.exitCode = 1;
        return;
      }
      await setDemoPassword(password);
      console.log(`Password updated for ${DEMO_OWNER_EMAIL}. All demo sessions were signed out.`);
      return;
    }

    default:
      console.error(`Unknown command "${command}". Use: status | seed | reset | password`);
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
