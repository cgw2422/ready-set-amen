"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type ResetRequestState,
} from "@/lib/actions/account";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LogoLockup } from "@/components/brand";

const initial: ResetRequestState = {};

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordResetAction, initial);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex justify-center">
        <LogoLockup />
      </div>
      <h1 className="font-display text-3xl font-extrabold text-navy">Reset your password</h1>
      <p className="mt-1 text-navy-soft">
        Enter the email you use for Ready Set Amen and we&rsquo;ll send you a link.
      </p>

      {state.sent ? (
        <div className="mt-7 space-y-4">
          {/* Identical wording whether or not the address exists — the response
              must never confirm who has an account. */}
          <Alert tone="success" title="Check your email">
            If that email address has a Ready Set Amen account, a reset link is on its way. It
            expires in 30 minutes.
          </Alert>

          {state.devLink ? (
            <Card className="border-gold/40 bg-gold-soft p-4">
              <p className="font-display text-sm font-bold text-navy">
                Development mode — no email provider configured
              </p>
              <p className="mt-1 text-xs text-navy-soft">
                This link is shown here only because the app is not running in production. Configure
                <code className="mx-1">RESEND_API_KEY</code>
                before launch.
              </p>
              <input
                readOnly
                value={state.devLink}
                aria-label="Password reset link"
                onFocus={(e) => e.currentTarget.select()}
                className="mt-3 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs text-navy"
              />
            </Card>
          ) : null}

          <p className="text-sm text-navy-soft">
            Didn&rsquo;t get it? Check spam, or ask whoever set up your church&rsquo;s account —
            an owner can send you a reset link directly.
          </p>
          <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-green-brand underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form action={action} className="mt-7 space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Email" required>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              placeholder="you@church.org"
            />
          </Field>

          <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">
            Send reset link
          </SubmitButton>

          <p className="text-center text-sm text-navy-soft">
            <Link href="/login" className="font-semibold text-green-brand underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
