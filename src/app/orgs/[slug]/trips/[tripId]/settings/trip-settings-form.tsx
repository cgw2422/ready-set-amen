"use client";

import { useActionState, useRef } from "react";
import { updateTripAction } from "@/lib/actions/trips";
import type { FormState } from "@/lib/actions/auth";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SaveError, SaveStatus } from "@/components/save-status";
import { useDirtyForm } from "@/components/unsaved-changes";

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

  // After a rejected save the action hands back what was typed; React would
  // otherwise reset every uncontrolled field to the values the trip had.
  const field = (key: string) => state.submitted?.[key] ?? values[key];

  // React applies defaultValue on mount and resets an uncontrolled form once
  // an action settles, so the echoed values only appear if the form remounts.
  // Keying on the values themselves means every distinct rejection restores
  // what was actually typed that time.
  const formKey = state.submitted ? JSON.stringify(state.submitted) : "saved";

  const formRef = useRef<HTMLFormElement>(null);
  useDirtyForm(formRef, state);

  return (
    <form ref={formRef} action={action} key={formKey} className="space-y-4">
      <SaveStatus state={state} savedMessage="Saved. Your trip settings are up to date." />

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">The basics</p>
        <div className="space-y-3">
          <Field label="Trip name" required>
            <Input name="name" required defaultValue={field("name")} />
          </Field>
          <Field label="Destination">
            <Input name="destination" defaultValue={field("destination")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Departure date">
              <Input name="startDate" type="date" defaultValue={field("startDate")} />
            </Field>
            <Field label="Return date">
              <Input name="endDate" type="date" defaultValue={field("endDate")} />
            </Field>
          </div>
          <Field label="Departure location">
            <Input name="departureLocation" defaultValue={field("departureLocation")} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={field("status")}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={field("description")} />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-display text-base font-bold text-navy">Money</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cost per person">
            <Input name="costPerPerson" inputMode="decimal" defaultValue={field("costPerPerson")} />
          </Field>
          <Field label="Deposit amount">
            <Input name="depositAmount" inputMode="decimal" defaultValue={field("depositAmount")} />
          </Field>
          <Field label="Deposit due">
            <Input name="depositDueDate" type="date" defaultValue={field("depositDueDate")} />
          </Field>
          <Field label="Final payment due">
            <Input
              name="finalPaymentDueDate"
              type="date"
              defaultValue={field("finalPaymentDueDate")}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-navy-faint">
          Ready Set Amen tracks payments — it doesn&rsquo;t process them.
        </p>
      </Card>

      <div>
        <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
          Save trip settings
        </SubmitButton>
        <SaveError state={state} />
      </div>
    </form>
  );
}
