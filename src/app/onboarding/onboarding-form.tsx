"use client";

import { useActionState } from "react";
import { createOrganizationAction, type FormState } from "@/lib/actions/auth";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LogoLockup } from "@/components/brand";

const initial: FormState = {};

export function OnboardingForm({ firstName }: { firstName: string }) {
  const [state, action] = useActionState(createOrganizationAction, initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">
        Hey {firstName}, who are you leading?
      </h1>
      <p className="mt-1 text-navy-soft">
        Add your church or organization. Your trips, waivers, and people live here.
      </p>

      <form action={action} className="mt-7 space-y-4">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Field label="Church or organization name" required>
          <Input name="name" required placeholder="Grace Community Church" autoFocus />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-2">
            <Input name="city" placeholder="Nashville" />
          </Field>
          <Field label="State">
            <Input name="state" placeholder="TN" maxLength={40} />
          </Field>
        </div>

        <SubmitButton size="lg" className="w-full" pendingLabel="Setting things up…">
          Create organization
        </SubmitButton>
      </form>
    </main>
  );
}
