"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LAUNCH_PRICE } from "@/lib/pricing";
import { LogoLockup } from "@/components/brand";

const initial: FormState = {};

export function SignupForm({ invite }: { invite: string }) {
  const [state, action] = useActionState(signupAction, initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">
        Create your Ready Set Amen account.
      </h1>
      <p className="mt-1 text-navy-soft">
        Start building your first church trip free. No card required.
      </p>

      {/* The price is stated up front, at normal reading size. Someone should
          never discover what this costs only after they have done the work. */}
      {invite ? null : (
        <p className="mt-4 rounded-xl bg-gold-soft px-4 py-3 text-sm leading-relaxed text-navy">
          Ready Set Amen is <strong className="font-bold">{LAUNCH_PRICE} lifetime</strong> during our
          launch period. You&rsquo;ll only be asked to pay once you&rsquo;re ready to use your trip
          for real.
        </p>
      )}

      <form action={action} className="mt-7 space-y-4">
        {invite ? <input type="hidden" name="invite" value={invite} /> : null}
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
