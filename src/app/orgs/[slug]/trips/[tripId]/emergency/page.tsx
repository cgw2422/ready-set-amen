import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { ageOn, displayName } from "@/lib/format";
import { Alert } from "@/components/ui";
import { EmergencyList } from "./emergency-list";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Emergency info",
  // Medical data for minors — never indexed, never cached by a proxy.
  robots: { index: false, follow: false, nocache: true },
};

export default async function EmergencyPage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTrip(tripId);

  const [attendees, leaderAssignments] = await Promise.all([
    prisma.attendee.findMany({
      where: { tripId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        dateOfBirth: true,
        isMinor: true,
        isLeader: true,
        phone: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        emergencyContactRelation: true,
        allergies: true,
        medicalConditions: true,
        medications: true,
        dietaryRestrictions: true,
        insuranceProvider: true,
        insurancePolicyNumber: true,
        doctorName: true,
        doctorPhone: true,
        guardians: {
          orderBy: { isPrimary: "desc" },
          select: { name: true, phone: true, email: true, relationship: true },
        },
        vehicleAssignment: { select: { vehicle: { select: { name: true } } } },
        roomAssignment: { select: { room: { select: { name: true } } } },
      },
    }),
    prisma.leaderAssignment.findMany({
      where: { tripId, OR: [{ attendeeId: { not: null } }, { personName: { not: null } }] },
      orderBy: { sortOrder: "asc" },
      include: { attendee: { select: { firstName: true, lastName: true, preferredName: true, phone: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Emergency info</h1>
        <p className="text-sm text-navy-soft">
          Contacts, allergies, conditions, and medications for everyone on the trip.
        </p>
      </div>

      <Alert tone="warning">
        This screen shows medical information. It&rsquo;s only visible to signed-in leaders in your
        organization — please keep your phone locked and don&rsquo;t share screenshots.
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/print/trip/${tripId}/emergency`}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-navy px-4 text-[15px] font-semibold text-white"
        >
          Print emergency sheet
        </Link>
      </div>

      {leaderAssignments.length > 0 ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <p className="font-display text-base font-bold text-navy">Who to call first</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {leaderAssignments.map((a) => {
              const name = a.attendee ? displayName(a.attendee) : a.personName;
              const phone = a.attendee?.phone ?? a.personPhone;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-navy-soft">{a.role}</span>
                  <span className="font-semibold text-navy">
                    {name}
                    {phone ? (
                      <>
                        {" · "}
                        <a href={`tel:${phone}`} className="text-green-brand underline">
                          {phone}
                        </a>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <EmergencyList
        people={attendees.map((a) => ({
          id: a.id,
          name: displayName(a),
          legalName: `${a.firstName} ${a.lastName}`,
          age: ageOn(a.dateOfBirth),
          isMinor: a.isMinor,
          isLeader: a.isLeader,
          phone: a.phone,
          emergencyContactName: a.emergencyContactName,
          emergencyContactPhone: a.emergencyContactPhone,
          emergencyContactRelation: a.emergencyContactRelation,
          allergies: a.allergies,
          medicalConditions: a.medicalConditions,
          medications: a.medications,
          dietaryRestrictions: a.dietaryRestrictions,
          insuranceProvider: a.insuranceProvider,
          insurancePolicyNumber: a.insurancePolicyNumber,
          doctorName: a.doctorName,
          doctorPhone: a.doctorPhone,
          guardians: a.guardians.map((g) => ({
            name: g.name,
            phone: g.phone,
            email: g.email,
            relationship: g.relationship,
          })),
          vehicle: a.vehicleAssignment?.vehicle.name ?? null,
          room: a.roomAssignment?.room.name ?? null,
        }))}
      />
    </div>
  );
}
