"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LogoLockup } from "@/components/brand";

const initial: FormState = {};

export default function SignupPage() {
  const [state, action] = useActionState(signupAction, initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">Let&rsquo;s get you ready.</h1>
      <p className="mt-1 text-navy-soft">Create your account. It takes about a minute.</p>

      <form action={action} className="mt-7 space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input name="firstName" autoComplete="given-name" required />
          </Field>
          <Field label="Last name" required>
            <Input name="lastName" autoComplete="family-name" required />
          </Field>
        </div>

        <Field label="Email" required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@church.org"
          />
        </Field>

        <Field label="Password" required hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>

        <SubmitButton size="lg" className="w-full" pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-navy-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-green-brand underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
