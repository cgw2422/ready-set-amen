import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { listPurchases } from "@/lib/admin/directory";
import { formatCents } from "@/lib/admin/metrics";
import { Kpi, Panel, Td, Th, TableWrap, formatDate, formatNumber } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchases", robots: { index: false, follow: false } };

/**
 * Stripe purchases and manual grants, kept visibly distinct. A grant is never
 * dressed up as a sale: it has no amount and no Stripe reference, because none
 * exists.
 */
export default async function AdminPurchases() {
  await requirePlatformAdmin();
  const rows = await listPurchases();

  const real = rows.filter((row) => !row.isDemo);
  const stripe = real.filter((row) => row.source === "STRIPE_CHECKOUT");
  const manual = real.filter((row) => row.source === "MANUAL_GRANT");
  const revenue = stripe.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-navy">
        Purchases
      </h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi emphasis label="Stripe revenue" value={formatCents(revenue)} />
        <Kpi label="Stripe purchases" value={formatNumber(stripe.length)} />
        <Kpi label="Manual grants" value={formatNumber(manual.length)} />
      </div>

      <Panel
        title="All records"
        description="Newest first. Demo organizations are listed but excluded from the totals above."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Organization</Th>
              <Th>Owner email</Th>
              <Th>Date</Th>
              <Th numeric>Amount</Th>
              <Th>Currency</Th>
              <Th>Status</Th>
              <Th>Stripe reference</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td>
                  <span className="text-navy-soft">No purchases yet.</span>
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`/admin/organizations/${row.organizationId}`}
                      className="font-semibold text-green-deep hover:underline"
                    >
                      {row.organizationName}
                    </Link>
                    {row.isDemo ? (
                      <span className="ml-2 text-xs text-navy-faint">demo</span>
                    ) : null}
                  </Td>
                  <Td muted>{row.ownerEmail ?? "—"}</Td>
                  <Td muted>{formatDate(row.at)}</Td>
                  <Td numeric>
                    {row.source === "STRIPE_CHECKOUT" ? formatCents(row.amountCents) : "—"}
                  </Td>
                  <Td muted>
                    {row.source === "STRIPE_CHECKOUT" ? row.currency.toUpperCase() : "—"}
                  </Td>
                  <Td>
                    {row.source === "STRIPE_CHECKOUT" ? (
                      <span className="rounded-full bg-green-soft px-2.5 py-1 text-[11px] font-bold text-green-deep">
                        Stripe purchase
                      </span>
                    ) : (
                      <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-gold-deep">
                        Manual grant
                      </span>
                    )}
                  </Td>
                  <Td muted>
                    <span className="break-all text-xs">
                      {row.source === "STRIPE_CHECKOUT"
                        ? (row.paymentIntentId ?? row.checkoutSessionId ?? "—")
                        : (row.grantReason ?? "—")}
                    </span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <p className="text-xs leading-relaxed text-navy-faint">
        Revenue is the sum of what Stripe actually charged, so a change of price totals correctly.
        Manual grants carry no amount and are never counted as revenue or as a conversion. Refunds
        are not tracked yet, so this figure is gross. Only Stripe&rsquo;s own identifiers are shown
        — no secret keys and no card data ever reach this application.
      </p>
    </div>
  );
}
