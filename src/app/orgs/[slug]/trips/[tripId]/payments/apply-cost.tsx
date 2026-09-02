"use client";

import { useTransition } from "react";
import { applyTripCostAction } from "@/lib/actions/trips";
import { Button } from "@/components/ui";

export function ApplyCostButton({
  tripId,
  count,
  amount,
}: {
  tripId: string;
  count: number;
  amount: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-gold/40 bg-gold-soft p-3">
      <p className="text-sm text-navy">
        {count} {count === 1 ? "person has" : "people have"} no amount due yet.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        disabled={pending}
        onClick={() => startTransition(async () => void (await applyTripCostAction(tripId)))}
      >
        {pending ? "Applying…" : `Set them all to ${amount}`}
      </Button>
    </div>
  );
}
