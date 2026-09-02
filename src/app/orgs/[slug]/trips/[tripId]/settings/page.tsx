import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { toNumber } from "@/lib/trip-data";
import { toDateInputValue } from "@/lib/format";
import { TripSettingsForm } from "./trip-settings-form";
import { DeleteTripCard } from "./delete-trip";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trip settings" };

export default async function TripSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { tripId } = await params;
  const ctx = await requireTrip(tripId);

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: {
      name: true,
      destination: true,
      description: true,
      startDate: true,
      endDate: true,
      departureLocation: true,
      status: true,
      costPerPerson: true,
      depositAmount: true,
      depositDueDate: true,
      finalPaymentDueDate: true,
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-extrabold text-navy">Trip settings</h1>

      <TripSettingsForm
        tripId={tripId}
        values={{
          name: trip.name,
          destination: trip.destination ?? "",
          description: trip.description ?? "",
          startDate: toDateInputValue(trip.startDate),
          endDate: toDateInputValue(trip.endDate),
          departureLocation: trip.departureLocation ?? "",
          status: trip.status,
          costPerPerson: trip.costPerPerson ? String(toNumber(trip.costPerPerson)) : "",
          depositAmount: trip.depositAmount ? String(toNumber(trip.depositAmount)) : "",
          depositDueDate: toDateInputValue(trip.depositDueDate),
          finalPaymentDueDate: toDateInputValue(trip.finalPaymentDueDate),
        }}
      />

      <DeleteTripCard tripId={tripId} tripName={ctx.trip.name} />
    </div>
  );
}
