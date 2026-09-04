"use client";

import { useActionState } from "react";
import { updateOrganizationAction } from "@/lib/actions/organization";
import type { FormState } from "@/lib/actions/auth";
import { Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SaveError, SaveStatus } from "@/components/save-status";

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

  const field = (key: "name" | "city" | "state") => state.submitted?.[key] ?? values[key];
  // See TripSettingsForm: an uncontrolled form has to remount to show the
  // values a rejected save handed back.
  const formKey = state.submitted ? JSON.stringify(state.submitted) : "saved";

  return (
    <Card className="p-4">
      <form action={action} key={formKey} className="space-y-3">
        <SaveStatus state={state} savedMessage="Saved. Your church details are up to date." />

        <Field label="Church or organization name" required>
          <Input name="name" required defaultValue={field("name")} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-2">
            <Input name="city" defaultValue={field("city")} disabled={!canEdit} />
          </Field>
          <Field label="State">
            <Input name="state" defaultValue={field("state")} disabled={!canEdit} />
          </Field>
        </div>

        {canEdit ? (
          <div>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            <SaveError state={state} />
          </div>
        ) : (
          <p className="text-xs text-navy-faint">
            Only an owner or admin can change these details.
          </p>
        )}
      </form>
    </Card>
  );
}
