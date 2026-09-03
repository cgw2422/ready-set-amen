import { requireTrip, requireTripPacket } from "@/lib/access";
import { DEFAULT_PACKET_SECTIONS, PACKET_SECTIONS } from "@/lib/print-data";
import { PacketBuilder } from "./packet-builder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trip packet" };

const INDIVIDUAL_REPORTS = [
  { slug: "roster", label: "Attendee roster" },
  { slug: "emergency", label: "Emergency contact sheet" },
  { slug: "vehicles", label: "Vehicle rosters" },
  { slug: "rooms", label: "Room rosters" },
  { slug: "itinerary", label: "Itinerary" },
  { slug: "unsigned-waivers", label: "Unsigned waivers" },
  { slug: "missing-forms", label: "Missing forms" },
  { slug: "outstanding-payments", label: "Outstanding payments" },
];

export default async function PacketPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  const ctx = await requireTrip(tripId);
  requireTripPacket(ctx, `/orgs/${slug}/trips/${tripId}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Trip packet</h1>
        <p className="text-sm text-navy-soft">
          Pick what goes in, then print it — or save it as a PDF straight from your phone.
        </p>
      </div>

      <PacketBuilder
        tripId={tripId}
        sections={PACKET_SECTIONS.map((s) => ({
          key: s.key,
          label: s.label,
          sensitive: "sensitive" in s ? Boolean(s.sensitive) : false,
        }))}
        defaults={DEFAULT_PACKET_SECTIONS}
        reports={INDIVIDUAL_REPORTS}
      />
    </div>
  );
}
