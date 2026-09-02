"use client";

import { useActionState } from "react";
import { quickAddAttendeesAction } from "@/lib/actions/people";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Card, Checkbox, Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

const EXAMPLE = `Maddie Ellis, minor, kellis@example.com
Jordan Ellis, minor, kellis@example.com
Chris Nguyen, adult, 615-555-0142, chris@example.com
Pastor Dana Reed, leader, 615-555-0180`;

export function QuickAddForm({ tripId }: { tripId: string }) {
  const [state, action] = useActionState(quickAddAttendeesAction.bind(null, tripId), initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Card className="p-4">
        <Field
          label="Your roster"
          hint="Name first. Then, in any order: minor / adult / leader, a phone number, and an email. A minor's email is treated as their parent's."
          required
        >
          <Textarea name="roster" rows={12} placeholder={EXAMPLE} required autoFocus className="font-mono text-sm" />
        </Field>

        <label className="mt-3 flex items-center gap-3">
          <Checkbox name="defaultMinor" defaultChecked />
          <span className="text-sm font-semibold text-navy">
            Treat everyone as a minor unless the line says adult or leader
            <span className="block text-xs font-normal text-navy-faint">
              Most youth rosters are mostly students.
            </span>
          </span>
        </label>
      </Card>

      <SubmitButton size="lg" className="w-full" pendingLabel="Adding everyone…">
        Add everyone
      </SubmitButton>
    </form>
  );
}
