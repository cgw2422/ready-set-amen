"use client";

import { useActionState, useState } from "react";
import { createAttendeeAction, updateAttendeeAction } from "@/lib/actions/people";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export type AttendeeFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  gender: string;
  dateOfBirth: string;
  isMinor: boolean;
  isLeader: boolean;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  dietaryRestrictions: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  doctorName: string;
  doctorPhone: string;
  shirtSize: string;
  notes: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianRelationship: string;
};

export const emptyAttendee: AttendeeFormValues = {
  firstName: "",
  lastName: "",
  preferredName: "",
  gender: "",
  dateOfBirth: "",
  isMinor: false,
  isLeader: false,
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  allergies: "",
  medicalConditions: "",
  medications: "",
  dietaryRestrictions: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  doctorName: "",
  doctorPhone: "",
  shirtSize: "",
  notes: "",
  guardianName: "",
  guardianEmail: "",
  guardianPhone: "",
  guardianRelationship: "",
};

const initial: FormState = {};

export function AttendeeForm({
  mode,
  tripId,
  values,
}: {
  mode: "create" | "edit";
  tripId: string;
  values: AttendeeFormValues;
}) {
  const boundAction =
    mode === "create"
      ? createAttendeeAction.bind(null, tripId)
      : updateAttendeeAction.bind(null, values.id!);
  const [state, action] = useActionState(boundAction, initial);
  const [isMinor, setIsMinor] = useState(values.isMinor);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">Saved.</Alert> : null}

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">Who is this?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <Input name="firstName" defaultValue={values.firstName} required autoFocus={mode === "create"} />
          </Field>
          <Field label="Last name" required>
            <Input name="lastName" defaultValue={values.lastName} required />
          </Field>
          <Field label="Preferred name" hint="What they actually go by.">
            <Input name="preferredName" defaultValue={values.preferredName} />
          </Field>
          <Field label="Gender" hint="Used for room assignments.">
            <Select name="gender" defaultValue={values.gender}>
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input name="dateOfBirth" type="date" defaultValue={values.dateOfBirth} />
          </Field>
          <Field label="Shirt size">
            <Input name="shirtSize" defaultValue={values.shirtSize} placeholder="YL, S, M, L, XL" />
          </Field>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3">
            <Checkbox
              name="isMinor"
              defaultChecked={values.isMinor}
              onChange={(e) => setIsMinor(e.currentTarget.checked)}
            />
            <span className="text-sm font-semibold text-navy">
              This is a minor
              <span className="block text-xs font-normal text-navy-faint">
                A parent or guardian will sign their waiver.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3">
            <Checkbox name="isLeader" defaultChecked={values.isLeader} />
            <span className="text-sm font-semibold text-navy">
              This is an adult leader
              <span className="block text-xs font-normal text-navy-faint">
                Used when assigning rooms and vehicles.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">How do we reach them?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={values.phone} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" inputMode="email" defaultValue={values.email} />
          </Field>
        </div>
      </Card>

      <Card className={`p-4 ${isMinor ? "ring-2 ring-gold/50" : ""}`}>
        <p className="mb-1 font-display text-base font-bold text-navy">Parent / Guardian</p>
        <p className="mb-3 text-sm text-navy-soft">
          {isMinor
            ? "Required for minors — this is who receives the waiver link."
            : "Optional for adults."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required={isMinor}>
            <Input name="guardianName" defaultValue={values.guardianName} required={isMinor} />
          </Field>
          <Field label="Relationship">
            <Input name="guardianRelationship" defaultValue={values.guardianRelationship} placeholder="Mother" />
          </Field>
          <Field label="Email" hint="Where the waiver link goes.">
            <Input name="guardianEmail" type="email" inputMode="email" defaultValue={values.guardianEmail} />
          </Field>
          <Field label="Phone">
            <Input name="guardianPhone" type="tel" inputMode="tel" defaultValue={values.guardianPhone} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">Emergency contact</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" required>
            <Input name="emergencyContactName" defaultValue={values.emergencyContactName} required />
          </Field>
          <Field label="Phone" required>
            <Input
              name="emergencyContactPhone"
              type="tel"
              inputMode="tel"
              defaultValue={values.emergencyContactPhone}
              required
            />
          </Field>
          <Field label="Relationship">
            <Input name="emergencyContactRelation" defaultValue={values.emergencyContactRelation} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-1 font-display text-base font-bold text-navy">Medical</p>
        <p className="mb-3 text-sm text-navy-soft">
          Only leaders in your organization can see this. It never appears on a public page.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Allergies">
            <Textarea name="allergies" rows={2} defaultValue={values.allergies} />
          </Field>
          <Field label="Medical conditions">
            <Textarea name="medicalConditions" rows={2} defaultValue={values.medicalConditions} />
          </Field>
          <Field label="Medications">
            <Textarea name="medications" rows={2} defaultValue={values.medications} />
          </Field>
          <Field label="Dietary restrictions">
            <Textarea name="dietaryRestrictions" rows={2} defaultValue={values.dietaryRestrictions} />
          </Field>
          <Field label="Insurance provider">
            <Input name="insuranceProvider" defaultValue={values.insuranceProvider} />
          </Field>
          <Field label="Insurance policy number">
            <Input name="insurancePolicyNumber" defaultValue={values.insurancePolicyNumber} />
          </Field>
          <Field label="Doctor name">
            <Input name="doctorName" defaultValue={values.doctorName} />
          </Field>
          <Field label="Doctor phone">
            <Input name="doctorPhone" type="tel" inputMode="tel" defaultValue={values.doctorPhone} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <Field label="Notes">
          <Textarea name="notes" rows={3} defaultValue={values.notes} />
        </Field>
      </Card>

      <div className="sticky bottom-20 z-10 flex gap-3 lg:bottom-4">
        <SubmitButton size="lg" className="flex-1 shadow-lg" pendingLabel="Saving…">
          {mode === "create" ? "Add attendee" : "Save changes"}
        </SubmitButton>
        {mode === "create" ? (
          <SubmitButton
            size="lg"
            variant="secondary"
            className="shadow-lg"
            name="andAnother"
            value="true"
            pendingLabel="Saving…"
          >
            Save &amp; add another
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
