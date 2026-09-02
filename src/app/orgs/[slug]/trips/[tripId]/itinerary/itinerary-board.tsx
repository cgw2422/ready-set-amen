"use client";

import { useState, useTransition } from "react";
import {
  createItineraryItemAction,
  deleteItineraryItemAction,
  updateItineraryItemAction,
} from "@/lib/actions/schedule";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { formatClock, formatDate } from "@/lib/format";

type Item = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  notes: string | null;
  responsibleAttendeeId: string | null;
  responsibleName: string | null;
};

const initial: FormState = {};

export function ItineraryBoard({
  tripId,
  items,
  leaders,
  defaultDate,
  startNew = false,
}: {
  tripId: string;
  items: Item[];
  leaders: { id: string; name: string }[];
  defaultDate: string;
  startNew?: boolean;
}) {
  const [editing, setEditing] = useState<Item | "new" | null>(startNew ? "new" : null);
  const [pending, startTransition] = useTransition();

  const days = new Map<string, Item[]>();
  for (const item of items) {
    const bucket = days.get(item.date);
    if (bucket) bucket.push(item);
    else days.set(item.date, [item]);
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <ItineraryForm
          tripId={tripId}
          item={editing === "new" ? null : editing}
          leaders={leaders}
          defaultDate={defaultDate}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button type="button" className="w-full" onClick={() => setEditing("new")}>
          Add to the schedule
        </Button>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled yet."
          description="Meet at church, departure, lunch stop, check-in, evening service, free time, home."
        />
      ) : (
        [...days.entries()].map(([date, dayItems]) => (
          <section key={date}>
            <h2 className="sticky top-[73px] z-10 -mx-4 bg-cream/95 px-4 py-2 font-display text-lg font-bold text-navy backdrop-blur lg:mx-0 lg:px-0">
              {formatDate(new Date(`${date}T00:00:00Z`), { weekday: "long" })}
            </h2>
            <ul className="space-y-2">
              {dayItems.map((item) => (
                <Card as="li" key={item.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="w-20 shrink-0">
                      <p className="font-display text-base font-bold text-green-brand">
                        {formatClock(item.startTime) || "—"}
                      </p>
                      {item.endTime ? (
                        <p className="text-xs text-navy-faint">to {formatClock(item.endTime)}</p>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{item.title}</p>
                      {item.location ? (
                        <p className="text-sm text-navy-soft">{item.location}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-1 text-sm text-navy-soft">{item.description}</p>
                      ) : null}
                      {item.responsibleName ? (
                        <p className="mt-1 text-xs text-navy-faint">
                          Led by {item.responsibleName}
                        </p>
                      ) : null}
                      {item.notes ? (
                        <p className="mt-1 text-xs text-navy-faint">{item.notes}</p>
                      ) : null}

                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditing(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await deleteItineraryItemAction(item.id);
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ItineraryForm({
  tripId,
  item,
  leaders,
  defaultDate,
  onDone,
}: {
  tripId: string;
  item: Item | null;
  leaders: { id: string; name: string }[];
  defaultDate: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<FormState>(initial);

  return (
    <Card className="p-4">
      <form
        action={async (formData) => {
          const result = item
            ? await updateItineraryItemAction(item.id, initial, formData)
            : await createItineraryItemAction(tripId, initial, formData);
          setState(result);
          if (!result.error) onDone();
        }}
        className="space-y-3"
      >
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <p className="font-display text-base font-bold text-navy">
          {item ? "Edit item" : "Add to the schedule"}
        </p>

        <Field label="What's happening?" required>
          <Input name="title" required defaultValue={item?.title} placeholder="Meet at church" autoFocus />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" required>
            <Input name="date" type="date" required defaultValue={item?.date ?? defaultDate} />
          </Field>
          <Field label="Start">
            <Input name="startTime" type="time" defaultValue={item?.startTime ?? ""} />
          </Field>
          <Field label="End">
            <Input name="endTime" type="time" defaultValue={item?.endTime ?? ""} />
          </Field>
        </div>

        <Field label="Location">
          <Input name="location" defaultValue={item?.location ?? ""} placeholder="Church parking lot" />
        </Field>

        <Field label="Details">
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ""} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Responsible leader">
            <Select name="responsibleAttendeeId" defaultValue={item?.responsibleAttendeeId ?? ""}>
              <option value="">Nobody yet</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Input name="notes" defaultValue={item?.notes ?? ""} />
          </Field>
        </div>

        <div className="flex gap-2">
          <Button type="submit">{item ? "Save" : "Add"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
