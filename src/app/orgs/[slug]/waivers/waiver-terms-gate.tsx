"use client";

import { useState, useTransition } from "react";
import { acknowledgeWaiverTermsAction } from "@/lib/actions/members";
import { WAIVER_TERMS_TEXT } from "@/lib/legal";
import { Alert, Button, Card } from "@/components/ui";

/**
 * Shown once, before a church creates its first waiver template. After the
 * owner acknowledges it, it never appears again — the point is to be read once,
 * not to nag (see the product spec: "do not make this warning repeatedly
 * interrupt normal use after acknowledgement").
 */
export function WaiverTermsGate({ slug, isOwner }: { slug: string; isOwner: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-gold/50 bg-gold-soft p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">
        Before your first waiver
      </p>
      <h2 className="mt-1 font-display text-xl font-extrabold text-navy">
        Your church owns the waiver language.
      </h2>

      <p className="mt-3 rounded-xl border border-line bg-white p-4 text-[15px] leading-relaxed text-navy">
        {WAIVER_TERMS_TEXT}
      </p>

      <p className="mt-3 text-sm text-navy-soft">
        Ready Set Amen never writes waiver language for you and does not provide legal advice. You
        paste in the wording your church has approved, and we collect signatures against it.
      </p>

      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {isOwner ? (
        <Button
          type="button"
          size="lg"
          className="mt-4 w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await acknowledgeWaiverTermsAction(slug);
              if (result.error) setError(result.error);
            })
          }
        >
          {pending ? "Saving…" : "I understand — continue"}
        </Button>
      ) : (
        <div className="mt-4">
          <Alert tone="info">
            The organization owner needs to acknowledge this once before your church can create its
            first waiver. Ask them to open this page.
          </Alert>
        </div>
      )}
    </Card>
  );
}
