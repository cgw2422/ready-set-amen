"use client";

import { useState } from "react";
import { deleteOrganizationAction } from "@/lib/actions/members";
import { Button, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/**
 * Deleting an organization removes every trip, every attendee's medical record
 * and every signed waiver. It exists because a church must be able to erase
 * their data, so it asks for the name typed exactly rather than a one-tap
 * confirm.
 */
export function DeleteOrganizationCard({
  slug,
  organizationName,
}: {
  slug: string;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <Card className="border-coral/40 bg-coral-soft/40 p-4">
      <p className="font-display text-base font-bold text-navy">Delete this organization</p>
      <p className="mt-1 text-sm text-navy-soft">
        This permanently removes every trip, person, medical note, payment record and{" "}
        <span className="font-semibold">signed waiver</span> belonging to {organizationName}, and
        removes access for everyone on the team. It can&rsquo;t be undone.
      </p>

      {open ? (
        <form action={deleteOrganizationAction.bind(null, slug)} className="mt-4 space-y-3">
          <Field label={`Type "${organizationName}" to confirm`} required>
            <Input
              name="confirmation"
              required
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.currentTarget.value)}
            />
          </Field>
          <div className="flex gap-2">
            <SubmitButton
              variant="danger"
              disabled={typed !== organizationName}
              pendingLabel="Deleting…"
            >
              Permanently delete
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Delete organization
        </Button>
      )}
    </Card>
  );
}
