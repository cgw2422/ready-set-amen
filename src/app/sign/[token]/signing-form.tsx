"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitSignatureAction, type SignState } from "@/lib/actions/sign";
import {
  ELECTRONIC_CONSENT_TEXT,
  LEGAL_DISCLAIMER,
  enabledSections,
  type WaiverContent,
} from "@/lib/waiver-content";
import { Alert, Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SignaturePad } from "@/components/signature-pad";
import { WaiverText } from "@/components/waiver-text";
import { CheckBadge, Confetti, LogoLockup, Wordmark } from "@/components/brand";

const initial: SignState = {};

type Props = {
  token: string;
  content: WaiverContent;
  signerRole: "SELF" | "GUARDIAN";
  participantName: string;
  participantLegalName: string;
  participantDob: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  tripName: string;
  tripDates: string;
  organizationName: string;
};

export function SigningForm(props: Props) {
  const [state, action] = useActionState(submitSignatureAction, initial);
  const [step, setStep] = useState(0);
  const isGuardian = props.signerRole === "GUARDIAN";
  const sections = enabledSections(props.content);
  const fields = props.content.fields.filter((f) => f.enabled);

  if (state.success) {
    return <SignedConfirmation success={state.success} organizationName={props.organizationName} />;
  }

  const prefill = (key: string): string => {
    switch (key) {
      case "participantName":
        return props.participantLegalName;
      case "participantDob":
        return props.participantDob;
      case "guardianName":
        return props.guardianName;
      case "guardianEmail":
        return props.guardianEmail;
      case "guardianPhone":
        return props.guardianPhone;
      default:
        return "";
    }
  };

  const steps = ["Your information", "Review the waiver", "Sign"];

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <div className="flex justify-center">
        <LogoLockup />
      </div>

      {/* Who is being signed for — stated plainly, every step. ------------- */}
      <Card className="mt-6 border-green-brand/30 bg-green-tint p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-green-deep">
          {isGuardian ? "Signing for" : "Signing for yourself"}
        </p>
        <p className="font-display text-xl font-extrabold text-navy">{props.participantName}</p>
        <p className="text-sm text-navy-soft">
          {props.tripName}
          {props.tripDates ? ` · ${props.tripDates}` : ""}
        </p>
        <p className="text-sm text-navy-soft">{props.organizationName}</p>
        {isGuardian ? (
          <p className="mt-2 text-xs text-navy-soft">
            You are signing as this participant&rsquo;s parent or legal guardian.
          </p>
        ) : null}
      </Card>

      <ol className="mt-5 flex gap-2" aria-label="Progress">
        {steps.map((label, index) => (
          <li key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${index <= step ? "bg-green-brand" : "bg-cream-deep"}`}
            />
            <p
              className={`mt-1 text-[11px] font-semibold ${
                index <= step ? "text-green-deep" : "text-navy-faint"
              }`}
            >
              {label}
            </p>
          </li>
        ))}
      </ol>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="token" value={props.token} />
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        {/* Step 1 — information -------------------------------------------- */}
        <div className={step === 0 ? "space-y-4" : "hidden"}>
          <Card className="p-4">
            <p className="mb-3 font-display text-base font-bold text-navy">
              A few details about {isGuardian ? props.participantName : "you"}
            </p>
            <div className="space-y-3">
              {fields.map((field) => (
                <Field key={field.key} label={field.label} required={field.required}>
                  {field.type === "textarea" ? (
                    <Textarea
                      name={`field_${field.key}`}
                      rows={2}
                      defaultValue={prefill(field.key)}
                      placeholder="None"
                    />
                  ) : (
                    <Input
                      name={`field_${field.key}`}
                      type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                      inputMode={field.type === "tel" ? "tel" : field.type === "email" ? "email" : undefined}
                      defaultValue={prefill(field.key)}
                    />
                  )}
                </Field>
              ))}

              {props.content.customQuestions.map((question) => (
                <Field key={question.key} label={question.label} required={question.required}>
                  {question.type === "textarea" ? (
                    <Textarea name={`field_${question.key}`} rows={2} />
                  ) : (
                    <Input name={`field_${question.key}`} />
                  )}
                </Field>
              ))}
            </div>
          </Card>

          <Button type="button" size="lg" className="w-full" onClick={() => setStep(1)}>
            Continue to the waiver
          </Button>
        </div>

        {/* Step 2 — the document ------------------------------------------- */}
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <Card className="p-5">
            <h1 className="font-display text-xl font-extrabold text-navy">
              {props.content.waiverTitle}
            </h1>
            <p className="text-sm text-navy-soft">{props.content.organizationName}</p>

            <div className="mt-4 space-y-5">
              {sections.map((section) => (
                <section key={section.key}>
                  <h2 className="font-display text-base font-bold text-navy">{section.heading}</h2>
                  <WaiverText body={section.body} className="mt-1 text-[15px] text-navy" />
                </section>
              ))}
            </div>
          </Card>

          {props.content.initials.length > 0 ? (
            <Card className="p-4">
              <p className="mb-3 font-display text-base font-bold text-navy">Initial each item</p>
              <div className="space-y-3">
                {props.content.initials.map((item) => (
                  <div key={item.key} className="flex items-start gap-3">
                    <Input
                      name={`field_${item.key}`}
                      maxLength={5}
                      required
                      aria-label={`Initials for: ${item.label}`}
                      className="w-20 shrink-0 text-center font-semibold uppercase"
                      placeholder="ABC"
                    />
                    <p className="text-sm text-navy">{item.label}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button type="button" size="lg" className="flex-1" onClick={() => setStep(2)}>
              Continue to sign
            </Button>
          </div>
        </div>

        {/* Step 3 — sign ---------------------------------------------------- */}
        <div className={step === 2 ? "space-y-4" : "hidden"}>
          <Card className="p-4">
            <p className="mb-3 font-display text-base font-bold text-navy">Who is signing?</p>
            <div className="space-y-3">
              <Field label={isGuardian ? "Parent / Guardian full name" : "Your full name"} required>
                <Input
                  name="signerName"
                  required
                  autoComplete="name"
                  defaultValue={isGuardian ? props.guardianName : props.participantLegalName}
                />
              </Field>

              {isGuardian ? (
                <Field label="Relationship to participant" required>
                  <Input
                    name="signerRelationship"
                    required
                    list="relationship-options"
                    defaultValue="Parent"
                  />
                </Field>
              ) : null}
              <datalist id="relationship-options">
                <option value="Parent" />
                <option value="Mother" />
                <option value="Father" />
                <option value="Legal Guardian" />
                <option value="Grandparent" />
              </datalist>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" hint="So we can reach you about the trip.">
                  <Input
                    name="signerEmail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    defaultValue={isGuardian ? props.guardianEmail : ""}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    name="signerPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    defaultValue={isGuardian ? props.guardianPhone : ""}
                  />
                </Field>
              </div>
            </div>
          </Card>

          {props.content.acknowledgements.length > 0 ? (
            <Card className="p-4">
              <p className="mb-3 font-display text-base font-bold text-navy">Please confirm</p>
              <div className="space-y-3">
                {props.content.acknowledgements.map((ack) => (
                  <label key={ack.key} className="flex items-start gap-3">
                    <Checkbox name={`ack_${ack.key}`} required={ack.required} className="mt-0.5" />
                    <span className="text-sm text-navy">
                      {ack.label}
                      {ack.required ? <span className="text-coral"> *</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-4">
            <p className="mb-1 font-display text-base font-bold text-navy">Your signature</p>
            <p className="mb-3 text-sm text-navy-soft">
              Type your full legal name exactly as you would write it.
            </p>
            <Field label="Typed signature" required>
              <Input
                name="typedSignature"
                required
                autoComplete="off"
                placeholder="Your full legal name"
                className="font-display text-lg"
              />
            </Field>

            <div className="mt-4">
              <p className="mb-1.5 text-sm font-semibold text-navy">
                Draw your signature
                {props.content.requireDrawnSignature ? (
                  <span className="text-coral"> *</span>
                ) : null}
              </p>
              <SignaturePad name="drawnSignature" required={props.content.requireDrawnSignature} />
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-xl bg-cream p-3">
              <Checkbox name="consent" required className="mt-0.5" />
              <span className="text-sm text-navy">
                {ELECTRONIC_CONSENT_TEXT}{" "}
                <Link href="/legal/esign" target="_blank" className="font-semibold underline">
                  Learn more
                </Link>
                <span className="text-coral"> *</span>
              </span>
            </label>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)}>
              Back
            </Button>
            <SubmitButton size="lg" className="flex-1" pendingLabel="Signing…">
              Sign waiver
            </SubmitButton>
          </div>

          <p className="text-center text-xs text-navy-faint">{LEGAL_DISCLAIMER}</p>
        </div>
      </form>
    </main>
  );
}

function SignedConfirmation({
  success,
  organizationName,
}: {
  success: NonNullable<SignState["success"]>;
  organizationName: string;
}) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-10 text-center">
      <div className="relative">
        <Confetti className="pointer-events-none absolute inset-x-0 -top-2 h-14 w-full" />
        <div className="relative flex justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-brand text-white animate-pop">
            <CheckBadge className="h-12 w-12 bg-transparent" />
          </span>
        </div>
      </div>

      <h1 className="mt-6 font-display text-3xl font-extrabold text-navy">You&rsquo;re all set!</h1>
      <p className="mt-2 text-navy-soft">
        Thank you. <span className="font-semibold text-navy">{success.attendeeName}</span> is signed
        and ready for <span className="font-semibold text-navy">{success.tripName}</span>.
      </p>
      <p className="mt-1 text-sm text-navy-faint">
        {organizationName} has received your signature. Reference {success.signedWaiverId.slice(-8)}.
      </p>

      {success.siblings.length > 0 ? (
        <Card className="mt-6 p-4 text-left">
          <p className="font-display text-base font-bold text-navy">
            You have {success.siblings.length} other{" "}
            {success.siblings.length === 1 ? "student" : "students"} on this trip.
          </p>
          <p className="mt-1 text-sm text-navy-soft">
            Each person needs their own signature. Tap a name to sign for them now.
          </p>
          <ul className="mt-3 space-y-2">
            {success.siblings.map((sibling) => (
              <li key={sibling.url}>
                <a
                  href={sibling.url}
                  className="flex min-h-[52px] items-center justify-between rounded-xl border border-line px-4 font-semibold text-navy hover:bg-cream"
                >
                  Sign for {sibling.name}
                  <span aria-hidden="true" className="text-navy-faint">
                    &rsaquo;
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Wordmark size="sm" />
      </div>
      <p className="mt-4 text-xs text-navy-faint">
        Need a copy? Ask your trip organizer — they can print or send you the signed waiver at any
        time.
      </p>
    </main>
  );
}
