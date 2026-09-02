"use client";

import { useTransition } from "react";
import { deleteTaskAction, setTaskStatusAction } from "@/lib/actions/schedule";
import { Badge, Button, Card } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueDate: string | null;
  isDefault: boolean;
};

const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "TODO",
};

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [pending, startTransition] = useTransition();

  const cycle = (task: Task) =>
    startTransition(async () => {
      await setTaskStatusAction(task.id, NEXT_STATUS[task.status]);
    });

  const remove = (task: Task) =>
    startTransition(async () => {
      await deleteTaskAction(task.id);
    });

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <Card as="li" key={task.id} className="p-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => cycle(task)}
              disabled={pending}
              aria-label={`Mark ${task.title} as ${NEXT_STATUS[task.status].toLowerCase().replace("_", " ")}`}
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                task.status === "DONE"
                  ? "border-green-brand bg-green-brand text-white"
                  : task.status === "IN_PROGRESS"
                    ? "border-gold bg-gold-soft text-gold-deep"
                    : "border-line bg-white text-transparent"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5 10 17.5 19 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold ${
                  task.status === "DONE" ? "text-navy-faint line-through" : "text-navy"
                }`}
              >
                {task.title}
              </p>
              {task.description ? (
                <p className="mt-0.5 text-sm text-navy-soft">{task.description}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {task.status === "IN_PROGRESS" ? <Badge tone="gold">In progress</Badge> : null}
                {task.dueDate ? (
                  <span className="text-xs text-navy-faint">
                    Due {formatDate(new Date(task.dueDate))}
                  </span>
                ) : null}
              </div>
            </div>

            {!task.isDefault ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => remove(task)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </Card>
      ))}
    </ul>
  );
}
