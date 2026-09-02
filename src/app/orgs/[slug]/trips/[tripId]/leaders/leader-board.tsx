"use client";

import { useState, useTransition } from "react";
import {
  deleteLeaderAssignmentAction,
  saveLeaderAssignmentAction,
} from "@/lib/actions/schedule";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Select } from "@/components/ui";

type Assignment = {
  id: string;
  role: string;
  attendeeId: string | null;
  personName: string | null;
  personPhone: string | null;
  notes: string | null;
  required: boolean;
  filledName: string | null;
  filledPhone: string | null;
};

const SUGGESTED_ROLES = [
  "Trip Leader",
  "Assistant Leader",
  "Driver",
  "Registration",
  "Hotel Check-In",
  "Meal Coordinator",
  "Medication Coordinator",
  "Headcount Leader",
  "Emergency Contact Lead",
  "Devotional",
  "Prayer",
  "Luggage",
  "Snacks",
];

const initial: FormState = {};

export function LeaderBoard({
  tripId,
  assignments,
  attendees,
}: {
  tripId: string;
  assignments: Assignment[];
  attendees: { id: string; name: string; isLeader: boolean }[];
}) {
  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const unfilled = assignments.filter((a) => !a.filledName);

  return (
    <div className="space-y-4">
      {unfilled.length > 0 ? (
        <Alert tone="warning">
          {unfilled.length} {unfilled.length === 1 ? "role has" : "roles have"} nobody assigned yet.
        </Alert>
      ) : null}

      {editing ? (
        <AssignmentForm
          tripId={tripId}
          assignment={editing === "new" ? null : editing}
          attendees={attendees}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setEditing("new")}>
          Add a responsibility
        </Button>
      )}

      <ul className="space-y-2">
        {assignments.map((assignment) => (
          <Card as="li" key={assignment.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-base font-bold text-navy">{assignment.role}</p>
                  {assignment.required ? <Badge tone="gold">Required</Badge> : null}
                </div>
                {assignment.filledName ? (
                  <p className="text-sm text-navy">
                    {assignment.filledName}
                    {assignment.filledPhone ? (
                      <>
                        {" · "}
                        <a href={`tel:${assignment.filledPhone}`} className="text-green-brand underline">
                          {assignment.filledPhone}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-coral-deep">Nobody assigned</p>
                )}
                {assignment.notes ? (
                  <p className="mt-1 text-xs text-navy-faint">{assignment.notes}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(assignment)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteLeaderAssignmentAction(assignment.id);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
}

function AssignmentForm({
  tripId,
  assignment,
  attendees,
  onDone,
}: {
  tripId: string;
  assignment: Assignment | null;
  attendees: { id: string; name: string; isLeader: boolean }[];
  onDone: () => void;
}) {
  const [state, setState] = useState<FormState>(initial);

  return (
    <Card className="p-4">
      <form
        action={async (formData) => {
          const result = await saveLeaderAssignmentAction(tripId, initial, formData);
          setState(result);
          if (!result.error) onDone();
        }}
        className="space-y-3"
      >
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={assignment?.id ?? ""} />

        <Field label="Responsibility" required>
          <Input name="role" required defaultValue={assignment?.role} list="role-options" autoFocus />
        </Field>
        <datalist id="role-options">
          {SUGGESTED_ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        <Field label="Who's doing it?">
          <Select name="attendeeId" defaultValue={assignment?.attendeeId ?? ""}>
            <option value="">Someone not on the roster</option>
            {attendees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.isLeader ? " (leader)" : ""}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="If they aren't on the roster.">
            <Input name="personName" defaultValue={assignment?.personName ?? ""} />
          </Field>
          <Field label="Phone">
            <Input name="personPhone" type="tel" inputMode="tel" defaultValue={assignment?.personPhone ?? ""} />
          </Field>
        </div>

        <Field label="Notes">
          <Input name="notes" defaultValue={assignment?.notes ?? ""} />
        </Field>

        <label className="flex items-center gap-3">
          <Checkbox name="required" defaultChecked={assignment?.required ?? false} />
          <span className="text-sm font-semibold text-navy">
            This role must be filled before the trip is ready
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
