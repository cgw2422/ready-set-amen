"use client";

import { useState } from "react";
import { deleteAttendeeAction } from "@/lib/actions/people";
import { Alert, Button, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function DeleteAttendeeButton({ attendeeId, name }: { attendeeId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="border-coral/40 bg-coral-soft/40 p-4">
      <p className="font-display text-base font-bold text-navy">Remove {name}</p>
      <p className="mt-1 text-sm text-navy-soft">
        This permanently deletes their information, including any signed waiver, assignments, and
        medical details. It can&rsquo;t be undone.
      </p>
      {confirming ? (
        <form action={deleteAttendeeAction.bind(null, attendeeId)} className="mt-3">
          <Alert tone="error">
            <p className="mb-3">Delete {name} and everything on their record?</p>
            <div className="flex gap-2">
              <SubmitButton variant="danger" size="sm" pendingLabel="Removing…">
                Yes, remove
              </SubmitButton>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </Alert>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setConfirming(true)}
        >
          Remove from trip
        </Button>
      )}
    </Card>
  );
}
