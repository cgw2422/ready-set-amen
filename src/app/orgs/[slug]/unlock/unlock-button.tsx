"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/lib/actions/billing";
import { Alert, Button } from "@/components/ui";

/** Sends the owner to Stripe's hosted Checkout. The action redirects on success. */
export function UnlockButton({
  slug,
  returnTo,
  label,
  disabled,
}: {
  slug: string;
  returnTo?: string;
  label: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startCheckoutAction(slug, returnTo);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Opening secure checkout…" : label}
      </Button>
    </div>
  );
}
