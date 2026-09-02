import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { toNumber } from "@/lib/trip-data";
import { ageOn, displayName, formatDate, minorFlagMismatch, money, toDateInputValue } from "@/lib/format";
import { Alert, Badge, Card, LinkButton } from "@/components/ui";
import { AttendeeForm } from "../attendee-form";
import { DeleteAttendeeButton } from "./delete-attendee";

export const dynamic = "force-dynamic";

const WAIVER_TONE = {
  SIGNED: "green",
  NOT_REQUIRED: "muted",
  VIEWED: "gold",
  SENT: "gold",
  NOT_SENT: "coral",
  SUPERSEDED: "coral",
} as const;

export default async function AttendeePage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string; attendeeId: string }>;
}) {
  const { slug, tripId, attendeeId } = await params;
  await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const attendee = await prisma.attendee.findFirst({
    where: { id: attendeeId, tripId },
    include: {
      guardians: { orderBy: { isPrimary: "desc" } },
      vehicleAssignment: { include: { vehicle: { select: { name: true } } } },
      roomAssignment: { include: { room: { select: { name: true } } } },
      payments: { orderBy: { receivedAt: "desc" } },
      documentStatuses: { include: { requirement: { select: { name: true, required: true } } } },
      waiverRecipients: {
        include: {
          requirement: { select: { title: true } },
          signedWaiver: { select: { id: true, signedAt: true, signerName: true } },
        },
      },
    },
  });
  if (!attendee) notFound();

  const guardian = attendee.guardians[0] ?? null;
  const due = toNumber(attendee.amountDue);
  const paid = toNumber(attendee.amountPaid);
  const age = ageOn(attendee.dateOfBirth);
  const flagMismatch = minorFlagMismatch(attendee);

  return (
    <div className="space-y-4">
      <Link href={`${base}/people`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand">
        &lsaquo; Back to people
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold text-navy">{displayName(attendee)}</h1>
        {attendee.isMinor ? <Badge tone="gold">Minor{age !== null ? ` · ${age}` : ""}</Badge> : null}
        {attendee.isLeader ? <Badge tone="navy">Leader</Badge> : null}
      </div>

      {flagMismatch ? (
        <Alert tone="warning" title="Check the minor/adult setting">
          {displayName(attendee)} is {flagMismatch.age}, but is marked as{" "}
          {attendee.isMinor ? "a minor" : "an adult"}. This decides who signs the waiver —{" "}
          {flagMismatch.expected === "adult"
            ? "an adult normally signs for themselves."
            : "a parent or guardian normally signs for a minor."}
        </Alert>
      ) : null}

      {/* At-a-glance ------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-faint">Emergency</p>
          {attendee.emergencyContactName ? (
            <>
              <p className="mt-1 font-semibold text-navy">{attendee.emergencyContactName}</p>
              <a
                href={`tel:${attendee.emergencyContactPhone ?? ""}`}
                className="text-green-brand underline"
              >
                {attendee.emergencyContactPhone || "No phone on file"}
              </a>
              <p className="text-xs text-navy-faint">{attendee.emergencyContactRelation}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-coral-deep">No emergency contact yet.</p>
          )}
          <LinkButton href={`${base}/emergency`} variant="secondary" size="sm" className="mt-3">
            Emergency mode
          </LinkButton>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-faint">
            Parent / Guardian
          </p>
          {guardian ? (
            <>
              <p className="mt-1 font-semibold text-navy">{guardian.name}</p>
              {guardian.phone ? (
                <a href={`tel:${guardian.phone}`} className="block text-green-brand underline">
                  {guardian.phone}
                </a>
              ) : null}
              {guardian.email ? (
                <p className="truncate text-sm text-navy-soft">{guardian.email}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-navy-soft">
              {attendee.isMinor ? "This minor still needs a guardian." : "None on file."}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-faint">Waivers</p>
          {attendee.waiverRecipients.length === 0 ? (
            <p className="mt-1 text-sm text-navy-soft">No waiver assigned to this trip yet.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {attendee.waiverRecipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy">
                      {r.requirement.title}
                    </span>
                    {r.signedWaiver ? (
                      <span className="block text-xs text-navy-faint">
                        Signed by {r.signedWaiver.signerName} on {formatDate(r.signedWaiver.signedAt)}
                      </span>
                    ) : null}
                  </span>
                  {r.signedWaiver ? (
                    <Link
                      href={`${base}/waivers/${r.signedWaiver.id}`}
                      className="shrink-0 text-sm font-semibold text-green-brand underline"
                    >
                      View
                    </Link>
                  ) : (
                    <Badge tone={WAIVER_TONE[r.status]}>{r.status.replace("_", " ").toLowerCase()}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-faint">Trip details</p>
          <dl className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-navy-soft">Payment</dt>
              <dd className="font-semibold text-navy">
                {money(paid)} of {money(due)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-navy-soft">Vehicle</dt>
              <dd className="font-semibold text-navy">
                {attendee.vehicleAssignment?.vehicle.name ?? "Not assigned"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-navy-soft">Room</dt>
              <dd className="font-semibold text-navy">
                {attendee.roomAssignment?.room.name ?? "Not assigned"}
              </dd>
            </div>
          </dl>
          {attendee.documentStatuses.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {attendee.documentStatuses.map((d) => (
                <li key={d.id}>
                  <Badge
                    tone={
                      d.status === "COMPLETE" ? "green" : d.status === "NOT_REQUIRED" ? "muted" : "coral"
                    }
                  >
                    {d.requirement.name}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <h2 className="pt-2 font-display text-xl font-bold text-navy">Edit details</h2>
      <AttendeeForm
        mode="edit"
        tripId={tripId}
        values={{
          id: attendee.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          preferredName: attendee.preferredName ?? "",
          gender: attendee.gender ?? "",
          dateOfBirth: toDateInputValue(attendee.dateOfBirth),
          isMinor: attendee.isMinor,
          isLeader: attendee.isLeader,
          phone: attendee.phone ?? "",
          email: attendee.email ?? "",
          emergencyContactName: attendee.emergencyContactName ?? "",
          emergencyContactPhone: attendee.emergencyContactPhone ?? "",
          emergencyContactRelation: attendee.emergencyContactRelation ?? "",
          allergies: attendee.allergies ?? "",
          medicalConditions: attendee.medicalConditions ?? "",
          medications: attendee.medications ?? "",
          dietaryRestrictions: attendee.dietaryRestrictions ?? "",
          insuranceProvider: attendee.insuranceProvider ?? "",
          insurancePolicyNumber: attendee.insurancePolicyNumber ?? "",
          doctorName: attendee.doctorName ?? "",
          doctorPhone: attendee.doctorPhone ?? "",
          shirtSize: attendee.shirtSize ?? "",
          notes: attendee.notes ?? "",
          guardianName: guardian?.name ?? "",
          guardianEmail: guardian?.email ?? "",
          guardianPhone: guardian?.phone ?? "",
          guardianRelationship: guardian?.relationship ?? "",
        }}
      />

      <DeleteAttendeeButton attendeeId={attendee.id} name={displayName(attendee)} />
    </div>
  );
}
