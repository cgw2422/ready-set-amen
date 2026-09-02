"use client";

import { useActionState } from "react";
import { assignWaiverToTripAction } from "@/lib/actions/waivers";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Field, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function AssignWaiverForm({
  tripId,
  templates,
}: {
  tripId: string;
  templates: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(assignWaiverToTripAction.bind(null, tripId), initial);
  if (templates.length === 0) return null;

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field
        label="Waiver"
        hint="The trip is pinned to this waiver's current version, so later edits never change what people already signed."
      >
        <Select name="templateId" required defaultValue={templates[0]?.id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="w-full sm:w-auto" pendingLabel="Assigning…">
        Assign to everyone on this trip
      </SubmitButton>
    </form>
  );
}
