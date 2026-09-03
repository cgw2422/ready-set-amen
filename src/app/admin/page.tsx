import { requirePlatformAdmin } from "@/lib/platform";
import { allTimeMetrics, formatCents, recentActivity, recentWindows } from "@/lib/admin/metrics";
import {
  Kpi,
  Panel,
  Td,
  Th,
  TableWrap,
  formatDateTime,
  formatNumber,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin", robots: { index: false, follow: false } };

/**
 * All Time first, because that is the question the platform owner actually
 * opens this page to answer: how many accounts, how many churches, how many
 * trips. Everything else is context underneath it.
 */
export default async function AdminDashboard() {
  await requirePlatformAdmin();

  const [all, windows, activity] = await Promise.all([
    allTimeMetrics(),
    recentWindows(),
    recentActivity(12),
  ]);

  const week = windows.find((w) => w.days === 7);
  const conversion =
    all.conversionRate === null ? "—" : `${(all.conversionRate * 100).toFixed(1)}%`;

  const trend = (count: number) => (count > 0 ? `+${formatNumber(count)} last 7 days` : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-navy">
          All time
        </h1>
        <p className="mt-1 text-sm text-navy-soft">
          Real churches only. The demo organization and its account are excluded from every number
          on this page.
        </p>
      </div>

      {/* The three the owner came for. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          emphasis
          label="Accounts created"
          value={formatNumber(all.accountsCreated)}
          trend={trend(week?.accountsCreated ?? 0)}
        />
        <Kpi
          emphasis
          label="Organizations created"
          value={formatNumber(all.organizationsCreated)}
          trend={trend(week?.organizationsCreated ?? 0)}
        />
        <Kpi
          emphasis
          label="Trips started"
          value={formatNumber(all.tripsStarted)}
          trend={trend(week?.tripsStarted ?? 0)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Lifetime purchases" value={formatNumber(all.lifetimePurchases)} />
        <Kpi label="Free setup" value={formatNumber(all.freeSetupOrganizations)} />
        <Kpi label="Conversion rate" value={conversion} />
        <Kpi label="Lifetime revenue" value={formatCents(all.lifetimeRevenueCents)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total attendees" value={formatNumber(all.totalAttendees)} />
        <Kpi label="Signed waivers" value={formatNumber(all.signedWaivers)} />
        <Kpi label="Manual lifetime" value={formatNumber(all.manualLifetimeOrganizations)} />
        <Kpi label="Demo organizations" value={formatNumber(all.demoOrganizations)} />
      </div>

      <p className="text-xs leading-relaxed text-navy-faint">
        <strong className="font-semibold text-navy-soft">Conversion rate</strong> is real
        organizations with a completed Stripe purchase divided by real organizations created (
        {formatNumber(all.paidOrganizations)} / {formatNumber(all.organizationsCreated)}). Manually
        granted lifetime access is counted separately and never as a conversion or as revenue.{" "}
        <strong className="font-semibold text-navy-soft">Lifetime revenue</strong> is the sum of
        what Stripe actually charged, so a change of price totals correctly. Refunds are not tracked
        yet, so this is gross rather than net.
      </p>

      {/* ------------------------------------------------------------ growth */}
      <Panel title="Recent growth" description="Rolling windows ending now.">
        <TableWrap>
          <thead>
            <tr>
              <Th>Window</Th>
              <Th numeric>Accounts</Th>
              <Th numeric>Organizations</Th>
              <Th numeric>Trips</Th>
              <Th numeric>Purchases</Th>
              <Th numeric>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {windows.map((window) => (
              <tr key={window.label}>
                <Td>{window.label}</Td>
                <Td numeric>{formatNumber(window.accountsCreated)}</Td>
                <Td numeric>{formatNumber(window.organizationsCreated)}</Td>
                <Td numeric>{formatNumber(window.tripsStarted)}</Td>
                <Td numeric>{formatNumber(window.lifetimePurchases)}</Td>
                <Td numeric>{formatCents(window.revenueCents)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>

      {/* ---------------------------------------------------------- activity */}
      <Panel
        title="Recent activity"
        description="Signups, churches, trips and purchases. No attendee or church data appears here."
      >
        {activity.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-soft">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {activity.map((entry, index) => (
              <li key={`${entry.kind}-${index}`} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                <span className="w-32 shrink-0 text-sm tabular-nums text-navy-faint">
                  {formatDateTime(entry.at)}
                </span>
                <span className="w-40 shrink-0 text-sm font-semibold text-navy">{entry.title}</span>
                <span className="min-w-0 flex-1 text-sm text-navy">{entry.subject}</span>
                {entry.detail ? (
                  <span className="text-sm text-navy-soft">{entry.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
