"use client";

import { useState } from "react";
import { deleteTripAction } from "@/lib/actions/trips";
import { Button, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Deleting a trip removes attendees, medical information, and signed waivers.
 * That is the point — organizations must be able to erase personal data — so it
 * asks for the trip name typed exactly rather than a one-tap confirm.
 */
export function DeleteTripCard({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <Card className="border-coral/40 bg-coral-soft/40 p-4">
      <p className="font-display text-base font-bold text-navy">Delete this trip</p>
      <p className="mt-1 text-sm text-navy-soft">
        This permanently removes every attendee, guardian, medical note, payment record, assignment,
        headcount, and <span className="font-semibold">signed waiver</span> for this trip. It
        can&rsquo;t be undone.
      </p>

      {open ? (
        <form action={deleteTripAction.bind(null, tripId)} className="mt-4 space-y-3">
          <Field label={`Type "${tripName}" to confirm`} required>
            <Input
              name="confirmation"
              required
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.currentTarget.value)}
            />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant="danger" disabled={typed !== tripName} pendingLabel="Deleting…">
              Permanently delete
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Delete trip
        </Button>
      )}
    </Card>
  );
}
