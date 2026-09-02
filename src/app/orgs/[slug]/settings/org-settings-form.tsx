"use client";

import { useActionState } from "react";
import { updateOrganizationAction } from "@/lib/actions/organization";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function OrgSettingsForm({
  slug,
  values,
  canEdit,
}: {
  slug: string;
  values: { name: string; city: string; state: string };
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateOrganizationAction.bind(null, slug), initial);

  return (
    <Card className="p-4">
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">Saved.</Alert> : null}

        <Field label="Church or organization name" required>
          <Input name="name" required defaultValue={values.name} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-2">
            <Input name="city" defaultValue={values.city} disabled={!canEdit} />
          </Field>
          <Field label="State">
            <Input name="state" defaultValue={values.state} disabled={!canEdit} />
          </Field>
        </div>

        {canEdit ? (
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        ) : (
          <p className="text-xs text-navy-faint">
            Only an owner or admin can change these details.
          </p>
        )}
      </form>
    </Card>
  );
}
