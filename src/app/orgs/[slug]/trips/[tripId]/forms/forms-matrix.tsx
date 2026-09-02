"use client";

import { useOptimistic, useTransition } from "react";
import {
  cycleDocumentStatusAction,
  deleteRequirementAction,
  toggleRequirementRequiredAction,
} from "@/lib/actions/forms";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

type Status = "MISSING" | "COMPLETE" | "NOT_REQUIRED";

type Attendee = { id: string; name: string; statuses: Record<string, Status> };
type Requirement = { id: string; name: string; description: string | null; required: boolean };

const NEXT: Record<Status, Status> = {
  MISSING: "COMPLETE",
  COMPLETE: "NOT_REQUIRED",
  NOT_REQUIRED: "MISSING",
};

const CELL: Record<Status, { label: string; className: string }> = {
  MISSING: { label: "Missing", className: "bg-coral-soft text-coral-deep border-coral/30" },
  COMPLETE: { label: "Complete", className: "bg-green-soft text-green-deep border-green-brand/30" },
  NOT_REQUIRED: { label: "N/A", className: "bg-cream-deep text-navy-faint border-line" },
};

export function FormsMatrix({
  requirements,
  attendees,
}: {
  requirements: Requirement[];
  attendees: Attendee[];
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    attendees,
    (state: Attendee[], change: { attendeeId: string; requirementId: string; status: Status }) =>
      state.map((a) =>
        a.id === change.attendeeId
          ? { ...a, statuses: { ...a.statuses, [change.requirementId]: change.status } }
          : a,
      ),
  );

  if (requirements.length === 0) {
    return (
      <EmptyState
        title="No requirements yet."
        description="Add the documents this trip needs and track them per person."
      />
    );
  }

  const cycle = (attendee: Attendee, requirementId: string) => {
    const current = attendee.statuses[requirementId] ?? "MISSING";
    startTransition(async () => {
      setOptimistic({ attendeeId: attendee.id, requirementId, status: NEXT[current] });
      await cycleDocumentStatusAction(attendee.id, requirementId);
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {requirements.map((requirement) => {
          const complete = optimistic.filter(
            (a) => (a.statuses[requirement.id] ?? "MISSING") === "COMPLETE",
          ).length;
          const na = optimistic.filter(
            (a) => a.statuses[requirement.id] === "NOT_REQUIRED",
          ).length;
          const outstanding = optimistic.length - complete - na;

          return (
            <Card key={requirement.id} as="li" className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-base font-bold text-navy">{requirement.name}</p>
                  {requirement.description ? (
                    <p className="text-sm text-navy-soft">{requirement.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-navy-faint">
                    {complete} complete · {outstanding} outstanding
                    {na > 0 ? ` · ${na} not required` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={requirement.required ? "green" : "muted"}>
                    {requirement.required ? "Counts toward readiness" : "Tracking only"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleRequirementRequiredAction(requirement.id);
                      })
                    }
                  >
                    Toggle
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteRequirementAction(requirement.id);
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {optimistic.map((attendee) => {
                  const status = attendee.statuses[requirement.id] ?? "MISSING";
                  return (
                    <li key={attendee.id}>
                      <button
                        type="button"
                        onClick={() => cycle(attendee, requirement.id)}
                        className="flex w-full min-h-[48px] items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left"
                      >
                        <span className="truncate text-sm text-navy">{attendee.name}</span>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${CELL[status].className}`}
                        >
                          {CELL[status].label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
