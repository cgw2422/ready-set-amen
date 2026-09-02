"use client";

import { useActionState, useState } from "react";
import { startHeadcountAction } from "@/lib/actions/headcount";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

const LABEL_SUGGESTIONS = [
  "Before Departure",
  "Rest Stop",
  "After Service",
  "Leaving Restaurant",
  "Hotel Curfew",
  "Returning Home",
];

export function StartHeadcountForm({
  tripId,
  attendeeCount,
  vehicles,
  rooms,
}: {
  tripId: string;
  attendeeCount: number;
  vehicles: { id: string; name: string; count: number }[];
  rooms: { id: string; name: string; count: number }[];
}) {
  const [state, action] = useActionState(startHeadcountAction.bind(null, tripId), initial);
  const [scope, setScope] = useState("TRIP");

  return (
    <Card className="p-4">
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        <Field label="What are you counting?">
          <Select name="scope" value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
            <option value="TRIP">Everyone on the trip ({attendeeCount})</option>
            {vehicles.length > 0 ? <option value="VEHICLE">A specific vehicle</option> : null}
            {rooms.length > 0 ? <option value="ROOM">A specific room</option> : null}
          </Select>
        </Field>

        {scope === "VEHICLE" ? (
          <Field label="Vehicle">
            <Select name="scopeId" required>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.count})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {scope === "ROOM" ? (
          <Field label="Room">
            <Select name="scopeId" required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.count})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Name this count">
          <Input name="label" list="headcount-labels" placeholder="Before Departure" />
        </Field>
        <datalist id="headcount-labels">
          {LABEL_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

        <SubmitButton size="lg" className="w-full" pendingLabel="Starting…">
          Start headcount
        </SubmitButton>
      </form>
    </Card>
  );
}
