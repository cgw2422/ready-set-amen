"use client";

import { useActionState } from "react";
import { createWaiverTemplateAction } from "@/lib/actions/waivers";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function NewWaiverForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createWaiverTemplateAction.bind(null, slug), initial);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Waiver name" hint="For your team — e.g. Student Ministry Release 2026." required>
        <Input name="name" required autoFocus placeholder="Student Ministry Release" />
      </Field>

      <Field label="Title shown to signers" hint="Leave blank to use the waiver name.">
        <Input name="waiverTitle" placeholder="Release, Waiver, and Medical Authorization" />
      </Field>

      <SubmitButton size="lg" className="w-full" pendingLabel="Creating…">
        Continue
      </SubmitButton>
    </form>
  );
}
