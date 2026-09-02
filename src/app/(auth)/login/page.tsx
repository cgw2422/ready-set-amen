"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LogoLockup } from "@/components/brand";

const initial: FormState = {};

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">Welcome back.</h1>
      <p className="mt-1 text-navy-soft">Let&rsquo;s keep the trip together.</p>

      <form action={action} className="mt-7 space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

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

        <Field label="Password" required>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-navy-soft">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-green-brand underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
