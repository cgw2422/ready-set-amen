"use client";

import { useActionState, useState } from "react";
import { createTaskAction } from "@/lib/actions/schedule";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function AddTaskForm({ tripId }: { tripId: string }) {
  const [state, action] = useActionState(createTaskAction.bind(null, tripId), initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        Add a task
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <Field label="Task" required>
          <Input name="title" required autoFocus placeholder="Confirm bus deposit" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notes">
            <Input name="description" />
          </Field>
          <Field label="Due date">
            <Input name="dueDate" type="date" />
          </Field>
        </div>
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Adding…">Add task</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
