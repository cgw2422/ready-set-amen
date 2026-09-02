"use client";

import { useActionState } from "react";
import { createDocumentRequirementAction } from "@/lib/actions/forms";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Checkbox, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function AddRequirementForm({ tripId }: { tripId: string }) {
  const [state, action] = useActionState(createDocumentRequirementAction.bind(null, tripId), initial);

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Add a requirement" required>
          <Input name="name" required placeholder="Passport" />
        </Field>
        <Field label="Notes">
          <Input name="description" placeholder="Must be valid 6 months past return" />
        </Field>
      </div>
      <label className="flex items-center gap-3">
        <Checkbox name="required" defaultChecked />
        <span className="text-sm font-semibold text-navy">
          Count this toward trip readiness
        </span>
      </label>
      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add requirement
      </SubmitButton>
    </form>
  );
}
