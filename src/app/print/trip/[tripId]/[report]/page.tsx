import { notFound } from "next/navigation";
import { requirePaidFeature, requireTrip } from "@/lib/access";
import { loadTripPacket, type PacketSectionKey } from "@/lib/print-data";
import { toNumber } from "@/lib/trip-data";
import { displayName, money } from "@/lib/format";
import { PacketSection, PrintSection } from "@/components/print/sections";
import { PrintHeader } from "@/components/print/print-header";

export const dynamic = "force-dynamic";

/**
 * The individual printable reports (docs/ARCHITECTURE.md §6). Everything here
 * is authenticated — `requireTrip` resolves through organization membership, so
 * a printout URL is not a way around access control.
 */
const REPORTS: Record<
  string,
  { title: string; sections?: PacketSectionKey[]; custom?: "unsigned" | "missing-forms" | "outstanding" }
> = {
  roster: { title: "Attendee Roster", sections: ["roster"] },
  emergency: { title: "Emergency Contact Sheet", sections: ["emergency", "medical"] },
  vehicles: { title: "Vehicle Rosters", sections: ["vehicles"] },
  rooms: { title: "Room Rosters", sections: ["rooms"] },
  itinerary: { title: "Itinerary", sections: ["itinerary"] },
  "unsigned-waivers": { title: "Unsigned Waivers", custom: "unsigned" },
  "missing-forms": { title: "Missing Forms", custom: "missing-forms" },
  "outstanding-payments": { title: "Outstanding Payments", custom: "outstanding" },
};

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return { title: REPORTS[report]?.title ?? "Report" };
}

export default async function PrintReportPage({
  params,
}: {
  params: Promise<{ tripId: string; report: string }>;
}) {
  const { tripId, report } = await params;
  const config = REPORTS[report];
  if (!config) notFound();

  const ctx = await requireTrip(tripId);
  requirePaidFeature(ctx, "trip-packet", `/orgs/${ctx.organization.slug}/trips/${tripId}`);
  const data = await loadTripPacket(tripId);

  return (
    <>
      <PrintHeader
        title={config.title}
        tripName={data.trip.name}
        organizationName={data.trip.organization.name}
        destination={data.trip.destination}
        startDate={data.trip.startDate}
        endDate={data.trip.endDate}
      />

      {config.sections?.map((section) => (
        <PacketSection key={section} data={data} section={section} />
      ))}

      {config.custom === "unsigned" ? <UnsignedWaivers data={data} /> : null}
      {config.custom === "missing-forms" ? <MissingForms data={data} /> : null}
      {config.custom === "outstanding" ? <OutstandingPayments data={data} /> : null}
    </>
  );
}

type Data = Awaited<ReturnType<typeof loadTripPacket>>;

function UnsignedWaivers({ data }: { data: Data }) {
  const outstanding = data.waiverRecipients.filter(
    (r) => r.status !== "SIGNED" && r.status !== "NOT_REQUIRED",
  );

  return (
    <PrintSection title={`Unsigned Waivers (${outstanding.length})`}>
      {outstanding.length === 0 ? (
        <p className="text-sm text-green-deep">Everyone has signed. Nothing outstanding.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Participant", "Waiver", "Who signs", "Status", "Contacted"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outstanding.map((r) => (
              <tr key={r.id}>
                <td className="border-b border-line px-2 py-1.5">{displayName(r.attendee)}</td>
                <td className="border-b border-line px-2 py-1.5">{r.requirement.title}</td>
                <td className="border-b border-line px-2 py-1.5">
                  {r.signerRole === "GUARDIAN" ? "Parent / guardian" : "Participant"}
                </td>
                <td className="border-b border-line px-2 py-1.5">
                  {r.status.replace("_", " ").toLowerCase()}
                </td>
                <td className="border-b border-line px-2 py-1.5">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintSection>
  );
}

function MissingForms({ data }: { data: Data }) {
  const rows = data.attendees.flatMap((a) =>
    data.requirements
      .filter((requirement) => {
        const status = a.documentStatuses.find((s) => s.requirementId === requirement.id)?.status;
        return status !== "COMPLETE" && status !== "NOT_REQUIRED";
      })
      .map((requirement) => ({ name: displayName(a), requirement: requirement.name })),
  );

  return (
    <PrintSection title={`Missing Forms (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="text-sm text-green-deep">Nothing outstanding.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Name", "Missing", "Received"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="border-b border-line px-2 py-1.5">{row.name}</td>
                <td className="border-b border-line px-2 py-1.5">{row.requirement}</td>
                <td className="border-b border-line px-2 py-1.5">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintSection>
  );
}

function OutstandingPayments({ data }: { data: Data }) {
  const rows = data.attendees
    .map((a) => ({
      name: displayName(a),
      due: toNumber(a.amountDue),
      paid: toNumber(a.amountPaid),
      status: a.paymentStatus,
    }))
    .filter(
      (r) => r.paid < r.due && r.status !== "SCHOLARSHIP" && r.status !== "WAIVED",
    );

  const total = rows.reduce((s, r) => s + (r.due - r.paid), 0);

  return (
    <PrintSection title={`Outstanding Payments (${money(total)})`}>
      {rows.length === 0 ? (
        <p className="text-sm text-green-deep">Everything is collected.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Name", "Due", "Paid", "Remaining", "Collected"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-1.5 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="border-b border-line px-2 py-1.5">{row.name}</td>
                <td className="border-b border-line px-2 py-1.5">{money(row.due)}</td>
                <td className="border-b border-line px-2 py-1.5">{money(row.paid)}</td>
                <td className="border-b border-line px-2 py-1.5 font-semibold">
                  {money(row.due - row.paid)}
                </td>
                <td className="border-b border-line px-2 py-1.5">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintSection>
  );
}
