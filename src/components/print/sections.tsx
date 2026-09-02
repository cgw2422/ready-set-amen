import { toNumber } from "@/lib/trip-data";
import { ageOn, displayName, formatClock, formatDate, formatDateRange, money } from "@/lib/format";
import type { PacketData, PacketSectionKey } from "@/lib/print-data";

/**
 * Printable report sections. These are plain server-rendered HTML styled by the
 * `@media print` rules in globals.css — no PDF library, which keeps V1 free to
 * run. Each section is also usable on its own report page.
 */

export function PrintSection({
  title,
  children,
  breakBefore,
}: {
  title: string;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section className={`mt-6 ${breakBefore ? "print-break" : ""}`}>
      <h2 className="mb-2 border-b-2 border-navy pb-1 font-display text-lg font-extrabold uppercase tracking-wide text-navy">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-navy-soft">Nothing recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-line px-2 py-1.5 text-left font-semibold text-navy"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border-b border-line px-2 py-1.5 align-top text-navy">
                  {cell === "" ? "—" : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PacketSection({ data, section }: { data: PacketData; section: PacketSectionKey }) {
  switch (section) {
    case "overview":
      return (
        <PrintSection title="Trip Overview">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <Row label="Trip" value={data.trip.name} />
            <Row label="Organization" value={data.trip.organization.name} />
            <Row label="Destination" value={data.trip.destination ?? "—"} />
            <Row label="Dates" value={formatDateRange(data.trip.startDate, data.trip.endDate)} />
            <Row label="Departure" value={data.trip.departureLocation ?? "—"} />
            <Row label="People" value={String(data.attendees.length)} />
            <Row label="Minors" value={String(data.attendees.filter((a) => a.isMinor).length)} />
            <Row label="Leaders" value={String(data.attendees.filter((a) => a.isLeader).length)} />
          </dl>
          {data.trip.description ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-navy">{data.trip.description}</p>
          ) : null}
        </PrintSection>
      );

    case "roster":
      return (
        <PrintSection title="Attendee Roster">
          <Table
            head={["Name", "Age", "Type", "Phone", "Vehicle", "Room"]}
            rows={data.attendees.map((a) => [
              displayName(a),
              ageOn(a.dateOfBirth) ?? "",
              a.isLeader ? "Leader" : a.isMinor ? "Minor" : "Adult",
              a.phone ?? "",
              a.vehicleAssignment?.vehicle.name ?? "",
              a.roomAssignment?.room.name ?? "",
            ])}
          />
        </PrintSection>
      );

    case "guardians":
      return (
        <PrintSection title="Parent / Guardian Contacts">
          <Table
            head={["Participant", "Guardian", "Relationship", "Phone", "Email"]}
            rows={data.attendees
              .filter((a) => a.guardians.length > 0)
              .flatMap((a) =>
                a.guardians.map((g) => [
                  displayName(a),
                  g.name,
                  g.relationship ?? "",
                  g.phone ?? "",
                  g.email ?? "",
                ]),
              )}
          />
        </PrintSection>
      );

    case "emergency":
      return (
        <PrintSection title="Emergency Contacts">
          <Table
            head={["Name", "Emergency contact", "Relationship", "Phone", "Guardian phone"]}
            rows={data.attendees.map((a) => [
              displayName(a),
              a.emergencyContactName ?? "",
              a.emergencyContactRelation ?? "",
              a.emergencyContactPhone ?? "",
              a.guardians[0]?.phone ?? "",
            ])}
          />
        </PrintSection>
      );

    case "medical":
      return (
        <PrintSection title="Medical Information">
          <p className="mb-2 text-xs font-semibold text-coral-deep">
            Confidential — keep this page with a trip leader and destroy it after the trip.
          </p>
          <Table
            head={["Name", "Allergies", "Conditions", "Medications", "Dietary", "Insurance"]}
            rows={data.attendees.map((a) => [
              displayName(a),
              a.allergies ?? "",
              a.medicalConditions ?? "",
              a.medications ?? "",
              a.dietaryRestrictions ?? "",
              [a.insuranceProvider, a.insurancePolicyNumber].filter(Boolean).join(" · "),
            ])}
          />
        </PrintSection>
      );

    case "waivers":
      return (
        <PrintSection title="Waiver Status">
          <Table
            head={["Name", "Waiver", "Status", "Signed by", "Date"]}
            rows={data.waiverRecipients.map((r) => [
              displayName(r.attendee),
              r.requirement.title,
              r.status.replace("_", " ").toLowerCase(),
              r.signedWaiver?.signerName ?? "",
              r.signedWaiver ? formatDate(r.signedWaiver.signedAt) : "",
            ])}
          />
        </PrintSection>
      );

    case "vehicles":
      return (
        <PrintSection title="Vehicle Assignments">
          {data.vehicles.length === 0 ? (
            <p className="text-sm text-navy-soft">No vehicles recorded.</p>
          ) : (
            <div className="space-y-4">
              {data.vehicles.map((v) => (
                <div key={v.id} className="print-avoid-break">
                  <p className="font-display text-base font-bold text-navy">
                    {v.name}{" "}
                    <span className="font-sans text-sm font-normal text-navy-soft">
                      {v.type} · {v.assignments.length}/{Math.max(0, v.capacity - v.reservedSeats)} ·
                      driver {v.driver ? displayName(v.driver) : (v.driverName ?? "not set")}
                      {(v.driver?.phone ?? v.driverPhone)
                        ? ` (${v.driver?.phone ?? v.driverPhone})`
                        : ""}
                    </span>
                  </p>
                  <ol className="mt-1 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3">
                    {v.assignments
                      .map((a) => displayName(a.attendee) + (a.attendee.isLeader ? " (leader)" : ""))
                      .sort()
                      .map((name, i) => (
                        <li key={i} className="border-b border-line py-1">
                          {i + 1}. {name}
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </PrintSection>
      );

    case "rooms":
      return (
        <PrintSection title="Room Assignments">
          {data.rooms.length === 0 ? (
            <p className="text-sm text-navy-soft">No rooms recorded.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.rooms.map((r) => (
                <div key={r.id} className="print-avoid-break">
                  <p className="font-display text-base font-bold text-navy">
                    {r.name}{" "}
                    <span className="font-sans text-sm font-normal text-navy-soft">
                      {r.type} · {r.assignments.length}/{r.capacity}
                      {r.designation !== "ANY" ? ` · ${r.designation.toLowerCase()}` : ""}
                    </span>
                  </p>
                  <ul className="mt-1 text-sm">
                    {r.assignments
                      .map((a) => displayName(a.attendee) + (a.attendee.isLeader ? " (leader)" : ""))
                      .sort()
                      .map((name, i) => (
                        <li key={i} className="border-b border-line py-1">
                          {name}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </PrintSection>
      );

    case "payments":
      return (
        <PrintSection title="Payment Status">
          <p className="mb-2 text-sm text-navy-soft">
            {money(data.totals.paid)} collected of {money(data.totals.due)} ·{" "}
            {money(Math.max(0, data.totals.due - data.totals.paid))} outstanding
          </p>
          <Table
            head={["Name", "Due", "Paid", "Remaining", "Status"]}
            rows={data.attendees.map((a) => {
              const due = toNumber(a.amountDue);
              const paid = toNumber(a.amountPaid);
              return [
                displayName(a),
                money(due),
                money(paid),
                money(Math.max(0, due - paid)),
                a.paymentStatus.replace("_", " ").toLowerCase(),
              ];
            })}
          />
        </PrintSection>
      );

    case "forms":
      return (
        <PrintSection title="Forms Checklist">
          {data.requirements.length === 0 ? (
            <p className="text-sm text-navy-soft">No form requirements recorded.</p>
          ) : (
            <Table
              head={["Name", ...data.requirements.map((r) => r.name)]}
              rows={data.attendees.map((a) => [
                displayName(a),
                ...data.requirements.map((r) => {
                  const status = a.documentStatuses.find((s) => s.requirementId === r.id)?.status;
                  return status === "COMPLETE" ? "✓" : status === "NOT_REQUIRED" ? "n/a" : "☐";
                }),
              ])}
            />
          )}
        </PrintSection>
      );

    case "itinerary":
      return (
        <PrintSection title="Itinerary">
          {data.itinerary.length === 0 ? (
            <p className="text-sm text-navy-soft">Nothing scheduled.</p>
          ) : (
            <div className="space-y-3">
              {[...new Set(data.itinerary.map((i) => i.date.toISOString().slice(0, 10)))].map(
                (day) => (
                  <div key={day} className="print-avoid-break">
                    <p className="font-display text-base font-bold text-navy">
                      {formatDate(new Date(`${day}T00:00:00Z`), { weekday: "long" })}
                    </p>
                    <ul className="text-sm">
                      {data.itinerary
                        .filter((i) => i.date.toISOString().slice(0, 10) === day)
                        .map((item) => (
                          <li key={item.id} className="flex gap-3 border-b border-line py-1">
                            <span className="w-24 shrink-0 font-semibold">
                              {formatClock(item.startTime) || "—"}
                            </span>
                            <span>
                              <span className="font-semibold">{item.title}</span>
                              {item.location ? ` · ${item.location}` : ""}
                              {item.responsible ? ` · ${displayName(item.responsible)}` : ""}
                              {item.description ? (
                                <span className="block text-navy-soft">{item.description}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </PrintSection>
      );

    case "leaders":
      return (
        <PrintSection title="Leader Assignments">
          <Table
            head={["Responsibility", "Person", "Phone", "Notes"]}
            rows={data.leaders.map((l) => [
              l.role,
              l.attendee ? displayName(l.attendee) : (l.personName ?? ""),
              l.attendee?.phone ?? l.personPhone ?? "",
              l.notes ?? "",
            ])}
          />
        </PrintSection>
      );

    case "tasks":
      return (
        <PrintSection title="Preparation Checklist">
          <ul className="text-sm">
            {data.tasks.map((t) => (
              <li key={t.id} className="flex gap-2 border-b border-line py-1">
                <span aria-hidden="true">{t.status === "DONE" ? "☑" : "☐"}</span>
                <span className={t.isPrayerStep ? "font-semibold" : ""}>{t.title}</span>
              </li>
            ))}
          </ul>
        </PrintSection>
      );

    case "prayer":
      return (
        <PrintSection title="Prayer Focus">
          {data.prayer.length === 0 && !data.trip.prayerNotes ? (
            <p className="text-sm text-navy-soft">No prayer focuses recorded yet.</p>
          ) : (
            <>
              <ul className="text-sm">
                {data.prayer.map((p) => (
                  <li key={p.id} className="border-b border-line py-1">
                    {p.text}
                  </li>
                ))}
              </ul>
              {data.trip.prayerNotes ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">{data.trip.prayerNotes}</p>
              ) : null}
            </>
          )}
          {data.trip.prayerCompletedAt ? (
            <p className="mt-3 font-display text-sm font-bold uppercase tracking-wide text-navy">
              Ready. Set. Amen. — prayed over on {formatDate(data.trip.prayerCompletedAt)}
            </p>
          ) : null}
        </PrintSection>
      );

    case "phones":
      return (
        <PrintSection title="Important Phone Numbers">
          <Table
            head={["Role", "Name", "Phone"]}
            rows={data.phoneBook.map((p) => [p.label, p.name ?? "", p.phone ?? ""])}
          />
        </PrintSection>
      );

    default:
      return null;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-faint">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
    </div>
  );
}
