"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/account";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LogoLockup } from "@/components/brand";

const initial: FormState = {};

export function ResetPasswordForm({ token, firstName }: { token: string; firstName: string }) {
  const [state, action] = useActionState(resetPasswordAction.bind(null, token), initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">
        Welcome back, {firstName}.
      </h1>
      <p className="mt-1 text-navy-soft">Choose a new password.</p>

      <form action={action} className="mt-7 space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Field label="New password" required hint="At least 10 characters.">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            autoFocus
          />
        </Field>

        <Field label="Confirm new password" required>
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>

        <Alert tone="info">
          Setting a new password signs you out on every device, including this one. You&rsquo;ll sign
          back in with the new password.
        </Alert>

        <SubmitButton size="lg" className="w-full" pendingLabel="Saving…">
          Set new password
        </SubmitButton>
      </form>
    </main>
  );
}
