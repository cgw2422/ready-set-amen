import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform";
import { organizationDetail } from "@/lib/admin/directory";
import { formatCents } from "@/lib/admin/metrics";
import {
  EntitlementTag,
  Kpi,
  Panel,
  Td,
  Th,
  TableWrap,
  formatDate,
  formatNumber,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization", robots: { index: false, follow: false } };

/**
 * A business overview of one church: who runs it, what it bought, how much it
 * holds. Deliberately not a way into its data — there is no route from here to
 * an attendee, a medical note, an emergency contact or a waiver answer.
 */
export default async function AdminOrganizationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const org = await organizationDetail(id);
  if (!org) notFound();

  const owner = org.members.find((m) => m.role === "OWNER");
  const leaders = org.members.filter((m) => m.role !== "OWNER");

  return (
    <div className="space-y-5">
      <Link
        href="/admin/organizations"
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand"
      >
        &lsaquo; All organizations
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold text-navy">{org.name}</h1>
        <EntitlementTag entitlement={org.entitlement} />
        {org.isDemo ? (
          <span className="rounded-full bg-cream-deep px-2.5 py-1 text-[11px] font-bold text-navy-soft">
            Excluded from business metrics
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Trips" value={formatNumber(org.trips)} />
        <Kpi label="Attendees" value={formatNumber(org.attendees)} />
        <Kpi label="Signed waivers" value={formatNumber(org.signedWaivers)} />
      </div>

      <Panel title="Details">
        <dl className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
          <Row label="Owner" value={owner ? `${owner.name} <${owner.email}>` : "—"} />
          <Row label="Created" value={formatDate(org.createdAt)} />
          <Row label="Last activity" value={formatDate(org.lastActivity)} />
          <Row label="Entitlement" value={org.entitlement} />
          <Row
            label="Leaders"
            value={
              leaders.length === 0
                ? "None yet"
                : leaders.map((l) => `${l.name} <${l.email}>`).join(", ")
            }
          />
        </dl>
      </Panel>

      <Panel title="Purchases" description="Stripe references for support. No card data, ever.">
        {org.purchases.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-soft">No purchase or grant recorded.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th numeric>Amount</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {org.purchases.map((purchase, index) => (
                <tr key={index}>
                  <Td muted>{formatDate(purchase.at)}</Td>
                  <Td>
                    {purchase.source === "STRIPE_CHECKOUT" ? "Stripe purchase" : "Manual grant"}
                  </Td>
                  <Td numeric>
                    {purchase.source === "STRIPE_CHECKOUT"
                      ? `${formatCents(purchase.amountCents)} ${purchase.currency.toUpperCase()}`
                      : "—"}
                  </Td>
                  <Td muted>
                    <span className="break-all text-xs">
                      {purchase.source === "STRIPE_CHECKOUT"
                        ? (purchase.paymentIntentId ?? purchase.checkoutSessionId ?? "—")
                        : (purchase.grantReason ?? "—")}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <p className="text-xs leading-relaxed text-navy-faint">
        This page shows aggregate counts only. Attendee records, medical and dietary information,
        emergency contacts, waiver answers, signatures and signing links are never loaded here.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-navy-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-navy">{value}</dd>
    </div>
  );
}
