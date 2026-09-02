import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { toNumber } from "@/lib/trip-data";
import { displayName, formatDate, money } from "@/lib/format";
import { Card, ProgressBar } from "@/components/ui";
import { PaymentsTable } from "./payments-table";
import { ApplyCostButton } from "./apply-cost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug, tripId } = await params;
  const { filter } = await searchParams;
  await requireTrip(tripId);

  const [trip, attendees] = await Promise.all([
    prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        costPerPerson: true,
        depositAmount: true,
        depositDueDate: true,
        finalPaymentDueDate: true,
      },
    }),
    prisma.attendee.findMany({
      where: { tripId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        amountDue: true,
        amountPaid: true,
        paymentStatus: true,
        payments: { orderBy: { receivedAt: "desc" }, select: { id: true, amount: true, receivedAt: true, method: true } },
      },
    }),
  ]);

  const totalDue = attendees.reduce((s, a) => s + toNumber(a.amountDue), 0);
  const totalPaid = attendees.reduce((s, a) => s + toNumber(a.amountPaid), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const unset = attendees.filter((a) => toNumber(a.amountDue) === 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Payments</h1>
        <p className="text-sm text-navy-soft">
          Ready Set Amen tracks what people owe. Collect money the way your church already does.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-3xl font-extrabold text-navy">{money(totalPaid)}</p>
            <p className="text-sm text-navy-soft">of {money(totalDue)} collected</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold text-coral-deep">{money(outstanding)}</p>
            <p className="text-xs text-navy-faint">outstanding</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar percent={totalDue > 0 ? (totalPaid / totalDue) * 100 : 0} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-navy-faint">Cost per person</dt>
            <dd className="font-semibold text-navy">
              {trip.costPerPerson ? money(toNumber(trip.costPerPerson)) : "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-navy-faint">Deposit</dt>
            <dd className="font-semibold text-navy">
              {trip.depositAmount ? money(toNumber(trip.depositAmount)) : "None"}
              {trip.depositDueDate ? ` · due ${formatDate(trip.depositDueDate)}` : ""}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-navy-faint">Final payment due</dt>
            <dd className="font-semibold text-navy">
              {trip.finalPaymentDueDate ? formatDate(trip.finalPaymentDueDate) : "Not set"}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-navy-faint">
          Set trip costs and due dates in{" "}
          <Link href={`/orgs/${slug}/trips/${tripId}/settings`} className="underline">
            trip settings
          </Link>
          .
        </p>

        {trip.costPerPerson && unset > 0 ? (
          <div className="mt-4">
            <ApplyCostButton
              tripId={tripId}
              count={unset}
              amount={money(toNumber(trip.costPerPerson))}
            />
          </div>
        ) : null}
      </Card>

      <PaymentsTable
        initialFilter={filter ?? "all"}
        attendees={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          amountDue: toNumber(a.amountDue),
          amountPaid: toNumber(a.amountPaid),
          status: a.paymentStatus,
          payments: a.payments.map((p) => ({
            id: p.id,
            amount: toNumber(p.amount),
            receivedAt: p.receivedAt.toISOString(),
            method: p.method,
          })),
        }))}
      />

      <Link
        href={`/print/trip/${tripId}/outstanding-payments`}
        className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
      >
        Print outstanding payments
      </Link>
    </div>
  );
}
