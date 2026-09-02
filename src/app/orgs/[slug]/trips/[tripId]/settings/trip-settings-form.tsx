"use client";

import { useActionState } from "react";
import { updateTripAction } from "@/lib/actions/trips";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

const STATUSES = [
  { value: "PLANNING", label: "Planning" },
  { value: "READY", label: "Ready" },
  { value: "IN_PROGRESS", label: "On the road" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

export function TripSettingsForm({
  tripId,
  values,
}: {
  tripId: string;
  values: Record<string, string>;
}) {
  const [state, action] = useActionState(updateTripAction.bind(null, tripId), initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">Saved.</Alert> : null}

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">The basics</p>
        <div className="space-y-3">
          <Field label="Trip name" required>
            <Input name="name" required defaultValue={values.name} />
          </Field>
          <Field label="Destination">
            <Input name="destination" defaultValue={values.destination} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Departure date">
              <Input name="startDate" type="date" defaultValue={values.startDate} />
            </Field>
            <Field label="Return date">
              <Input name="endDate" type="date" defaultValue={values.endDate} />
            </Field>
          </div>
          <Field label="Departure location">
            <Input name="departureLocation" defaultValue={values.departureLocation} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={values.status}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={values.description} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">Money</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cost per person">
            <Input name="costPerPerson" inputMode="decimal" defaultValue={values.costPerPerson} />
          </Field>
          <Field label="Deposit amount">
            <Input name="depositAmount" inputMode="decimal" defaultValue={values.depositAmount} />
          </Field>
          <Field label="Deposit due">
            <Input name="depositDueDate" type="date" defaultValue={values.depositDueDate} />
          </Field>
          <Field label="Final payment due">
            <Input
              name="finalPaymentDueDate"
              type="date"
              defaultValue={values.finalPaymentDueDate}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-navy-faint">
          Ready Set Amen tracks payments — it doesn&rsquo;t process them.
        </p>
      </Card>

      <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
        Save trip settings
      </SubmitButton>
    </form>
  );
}
