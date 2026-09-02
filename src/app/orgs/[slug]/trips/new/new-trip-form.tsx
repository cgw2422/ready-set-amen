"use client";

import { useActionState } from "react";
import { createTripAction } from "@/lib/actions/trips";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function NewTripForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createTripAction.bind(null, slug), initial);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Trip name" required>
        <Input name="name" required placeholder="Summer Mission Trip" autoFocus />
      </Field>

      <Field label="Destination">
        <Input name="destination" placeholder="Nashville, TN" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure date">
          <Input name="startDate" type="date" />
        </Field>
        <Field label="Return date">
          <Input name="endDate" type="date" />
        </Field>
      </div>

      <Field label="Departure location" hint="Where everyone meets before you leave.">
        <Input name="departureLocation" placeholder="Church parking lot" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost per person">
          <Input name="costPerPerson" inputMode="decimal" placeholder="150" />
        </Field>
        <Field label="Deposit">
          <Input name="depositAmount" inputMode="decimal" placeholder="50" />
        </Field>
      </div>

      <SubmitButton size="lg" className="w-full" pendingLabel="Creating your trip…">
        Create trip
      </SubmitButton>
    </form>
  );
}
