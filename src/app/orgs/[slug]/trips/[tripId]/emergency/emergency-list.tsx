"use client";

import { useState } from "react";
import { Badge, Card, Input } from "@/components/ui";

type Person = {
  id: string;
  name: string;
  legalName: string;
  age: number | null;
  isMinor: boolean;
  isLeader: boolean;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
  dietaryRestrictions: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  guardians: { name: string; phone: string | null; email: string | null; relationship: string | null }[];
  vehicle: string | null;
  room: string | null;
};

export function EmergencyList({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [medicalOnly, setMedicalOnly] = useState(false);

  const hasMedical = (p: Person) =>
    Boolean(p.allergies || p.medicalConditions || p.medications);

  const visible = people.filter((p) => {
    if (medicalOnly && !hasMedical(p)) return false;
    if (!query.trim()) return true;
    return p.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        placeholder="Find someone fast"
        aria-label="Search people"
        onChange={(e) => setQuery(e.currentTarget.value)}
      />

      <button
        type="button"
        onClick={() => setMedicalOnly((v) => !v)}
        className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
          medicalOnly
            ? "border-coral bg-coral text-white"
            : "border-line bg-white text-navy-soft"
        }`}
      >
        Only people with medical notes
      </button>

      <ul className="space-y-2">
        {visible.map((person) => {
          const open = openId === person.id;
          return (
            <Card as="li" key={person.id} className="p-0">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : person.id)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-navy">
                    {person.name}
                    {person.age !== null ? (
                      <span className="text-navy-faint"> · {person.age}</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-navy-faint">
                    {[person.vehicle, person.room].filter(Boolean).join(" · ") || "No assignments"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {hasMedical(person) ? <Badge tone="coral">Medical</Badge> : null}
                  {person.isMinor ? <Badge tone="gold">Minor</Badge> : null}
                </span>
              </button>

              {open ? (
                <div className="space-y-4 border-t border-line p-4">
                  <Section title="Emergency contact">
                    {person.emergencyContactName ? (
                      <p>
                        <span className="font-semibold text-navy">{person.emergencyContactName}</span>
                        {person.emergencyContactRelation ? ` (${person.emergencyContactRelation})` : ""}
                        {person.emergencyContactPhone ? (
                          <>
                            {" · "}
                            <a
                              href={`tel:${person.emergencyContactPhone}`}
                              className="font-semibold text-green-brand underline"
                            >
                              {person.emergencyContactPhone}
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-coral-deep">No emergency contact on file.</p>
                    )}
                  </Section>

                  {person.guardians.length > 0 ? (
                    <Section title="Parent / guardian">
                      {person.guardians.map((g, i) => (
                        <p key={i}>
                          <span className="font-semibold text-navy">{g.name}</span>
                          {g.relationship ? ` (${g.relationship})` : ""}
                          {g.phone ? (
                            <>
                              {" · "}
                              <a href={`tel:${g.phone}`} className="font-semibold text-green-brand underline">
                                {g.phone}
                              </a>
                            </>
                          ) : null}
                          {g.email ? <span className="block text-xs text-navy-faint">{g.email}</span> : null}
                        </p>
                      ))}
                    </Section>
                  ) : null}

                  <Section title="Medical">
                    <Detail label="Allergies" value={person.allergies} highlight />
                    <Detail label="Conditions" value={person.medicalConditions} highlight />
                    <Detail label="Medications" value={person.medications} highlight />
                    <Detail label="Dietary" value={person.dietaryRestrictions} />
                    <Detail label="Doctor" value={person.doctorName} />
                    <Detail label="Doctor phone" value={person.doctorPhone} />
                    <Detail label="Insurance" value={person.insuranceProvider} />
                    <Detail label="Policy number" value={person.insurancePolicyNumber} />
                  </Section>

                  <p className="text-xs text-navy-faint">Legal name: {person.legalName}</p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-navy-faint">{title}</p>
      <div className="mt-1 space-y-1 text-sm text-navy-soft">{children}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  if (!value?.trim()) return null;
  return (
    <p className={highlight ? "rounded-lg bg-coral-soft px-2 py-1 text-coral-deep" : ""}>
      <span className="font-semibold">{label}:</span> {value}
    </p>
  );
}
