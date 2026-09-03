"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import type { ComponentProps } from "react";

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    // disabled last: a spread that happened to carry `disabled` must not be
    // able to re-enable a button that is already submitting, which is what
    // stops a double tap creating two people.
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
