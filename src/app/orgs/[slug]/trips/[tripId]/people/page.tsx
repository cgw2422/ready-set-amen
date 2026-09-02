import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { toNumber } from "@/lib/trip-data";
import { ageOn, displayName, initials, money } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { PeopleFilters } from "./people-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

type Search = { q?: string; filter?: string; added?: string };

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug, tripId } = await params;
  const { q = "", filter = "all", added } = await searchParams;
  await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const attendees = await prisma.attendee.findMany({
    where: { tripId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      isMinor: true,
      isLeader: true,
      dateOfBirth: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      amountDue: true,
      amountPaid: true,
      paymentStatus: true,
      allergies: true,
      medications: true,
      guardians: { select: { id: true }, take: 1 },
      vehicleAssignment: { select: { vehicle: { select: { name: true } } } },
      roomAssignment: { select: { room: { select: { name: true } } } },
      waiverRecipients: { select: { status: true } },
    },
  });

  const needle = q.trim().toLowerCase();
  const filtered = attendees.filter((a) => {
    if (needle) {
      const haystack = `${a.firstName} ${a.lastName} ${a.preferredName ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    switch (filter) {
      case "minors":
        return a.isMinor;
      case "leaders":
        return a.isLeader;
      case "missing-emergency":
        return !(a.emergencyContactName?.trim() && a.emergencyContactPhone?.trim());
      case "unsigned":
        return a.waiverRecipients.some((r) => r.status !== "SIGNED" && r.status !== "NOT_REQUIRED");
      case "owing":
        return toNumber(a.amountPaid) < toNumber(a.amountDue);
      default:
        return true;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">People</h1>
          <p className="text-sm text-navy-soft">
            {attendees.length} on this trip · {attendees.filter((a) => a.isMinor).length} minors ·{" "}
            {attendees.filter((a) => a.isLeader).length} leaders
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`${base}/people/quick-add`} variant="secondary" size="sm">
            Quick add
          </LinkButton>
          <LinkButton href={`${base}/people/new`} size="sm">
            Add person
          </LinkButton>
        </div>
      </div>

      {added ? (
        <Alert tone="success">
          Added {added} {Number(added) === 1 ? "person" : "people"} to the trip.
        </Alert>
      ) : null}

      <PeopleFilters basePath={`${base}/people`} q={q} filter={filter} />

      {filtered.length === 0 ? (
        <EmptyState
          title={attendees.length === 0 ? "No one on the roster yet." : "No one matches that."}
          description={
            attendees.length === 0
              ? "Add people one at a time, or paste a whole list with Quick add."
              : "Try a different search or filter."
          }
          action={
            attendees.length === 0 ? (
              <LinkButton href={`${base}/people/quick-add`}>Paste your roster</LinkButton>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => {
            const due = toNumber(a.amountDue);
            const paid = toNumber(a.amountPaid);
            const owes = Math.max(0, due - paid);
            const waiverSigned =
              a.waiverRecipients.length > 0 &&
              a.waiverRecipients.every((r) => r.status === "SIGNED" || r.status === "NOT_REQUIRED");
            const missingEmergency = !(a.emergencyContactName?.trim() && a.emergencyContactPhone?.trim());
            const age = ageOn(a.dateOfBirth);

            return (
              <Card as="li" key={a.id} className="p-0">
                <Link
                  href={`${base}/people/${a.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-cream"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                      a.isLeader ? "bg-navy text-white" : "bg-green-soft text-green-deep"
                    }`}
                    aria-hidden="true"
                  >
                    {initials(a)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold text-navy">{displayName(a)}</span>
                      {a.isMinor ? <Badge tone="gold">Minor{age !== null ? ` · ${age}` : ""}</Badge> : null}
                      {a.isLeader ? <Badge tone="navy">Leader</Badge> : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-navy-faint">
                      {a.vehicleAssignment ? <span>{a.vehicleAssignment.vehicle.name}</span> : null}
                      {a.roomAssignment ? <span>{a.roomAssignment.room.name}</span> : null}
                      {a.allergies || a.medications ? <span>Medical noted</span> : null}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {missingEmergency ? <Badge tone="coral">No emergency contact</Badge> : null}
                    {a.waiverRecipients.length > 0 ? (
                      <Badge tone={waiverSigned ? "green" : "coral"}>
                        {waiverSigned ? "Waiver signed" : "Waiver needed"}
                      </Badge>
                    ) : null}
                    {owes > 0 ? <Badge tone="gold">{money(owes)} due</Badge> : null}
                  </span>
                </Link>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
