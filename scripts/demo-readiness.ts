/** Prints the demo trip's readiness exactly as the dashboard computes it. */
import { prisma } from "../src/lib/db";
import { loadTripReadiness } from "../src/lib/trip-data";
import { DEMO_ORG_SLUG } from "../src/lib/demo/constants";

async function main() {
  const trip = await prisma.trip.findFirstOrThrow({
    where: { organization: { slug: DEMO_ORG_SLUG } },
    select: { id: true, name: true },
  });
  const { readiness, counts } = await loadTripReadiness(trip.id);

  console.log(`${trip.name}: ${readiness.percent}% ready\n`);
  for (const c of readiness.categories) {
    if (!c.enabled) continue;
    console.log(
      `  ${c.label.padEnd(24)} ${String(Math.round(c.ratio * 100)).padStart(3)}%  w${String(c.weight).padStart(2)}  ${c.applicable ? c.summary : "n/a"}`,
    );
  }
  console.log("\nOutstanding items on the dashboard:");
  for (const issue of readiness.issues) console.log(`  [${issue.severity}] ${issue.headline} — ${issue.message}`);
  console.log(`\nprayerComplete=${readiness.prayerComplete} logisticsComplete=${readiness.logisticsComplete}`);
  console.log(`money: $${counts.totalPaid} of $${counts.totalDue}`);
}

main().finally(() => prisma.$disconnect());
