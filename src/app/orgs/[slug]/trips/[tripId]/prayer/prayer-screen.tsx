"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import {
  addPrayerFocusAction,
  removePrayerFocusAction,
  setPrayerCompleteAction,
} from "@/lib/actions/schedule";
import type { FormState } from "@/lib/actions/auth";
import { Alert, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Confetti, Wordmark } from "@/components/brand";
import { formatDate } from "@/lib/format";

const initial: FormState = {};

/**
 * Prayer is a real step, not a score. There is no streak, no points, no
 * leaderboard, and completing it never moves the readiness percentage.
 */
export function PrayerScreen({
  tripId,
  tripName,
  attendeeCount,
  completedAt,
  notes,
  focuses,
  suggestions,
  logisticsComplete,
  readinessPercent,
  dashboardHref,
}: {
  tripId: string;
  tripName: string;
  attendeeCount: number;
  completedAt: string | null;
  notes: string;
  focuses: { id: string; text: string }[];
  suggestions: string[];
  logisticsComplete: boolean;
  readinessPercent: number;
  dashboardHref: string;
}) {
  const [state, action] = useActionState(addPrayerFocusAction.bind(null, tripId), initial);
  const [pending, startTransition] = useTransition();

  const complete = (value: boolean, prayerNotes?: string) =>
    startTransition(async () => {
      await setPrayerCompleteAction(tripId, value, prayerNotes);
    });

  const addSuggestion = (text: string) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("text", text);
      await addPrayerFocusAction(tripId, {}, data);
    });

  if (completedAt) {
    return (
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-10 text-center text-white animate-pop">
          <Confetti className="pointer-events-none absolute inset-x-0 top-2 h-16 w-full" />
          <div className="relative flex justify-center">
            <Wordmark size="lg" />
          </div>
          <p className="mt-6 font-display text-2xl font-extrabold">You&rsquo;re ready to go.</p>
          <p className="mt-2 text-sm text-white/70">
            {tripName} was covered in prayer on {formatDate(new Date(completedAt))}.
          </p>
        </section>

        {focuses.length > 0 ? (
          <Card className="p-5">
            <p className="font-display text-base font-bold text-navy">What you prayed over</p>
            <ul className="mt-2 space-y-1.5 text-navy-soft">
              {focuses.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold">
                    •
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {notes ? (
          <Card className="p-5">
            <p className="font-display text-base font-bold text-navy">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-navy-soft">{notes}</p>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            href={dashboardHref}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-green-brand px-4 font-semibold text-white"
          >
            Back to the trip
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => complete(false)}
          >
            Undo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Pray over the group</h1>
        <p className="mt-1 text-navy-soft">
          Take time with your leaders to pray over every person, the travel, the services, the
          ministry, and what God wants to accomplish through this trip.
        </p>
      </div>

      {logisticsComplete ? (
        <Card className="border-gold/40 bg-gold-soft p-5 text-center">
          <p className="font-display text-xl font-extrabold text-navy">
            You&rsquo;ve checked the boxes.
          </p>
          <p className="mt-1 text-navy-soft">Now let&rsquo;s cover the trip in prayer.</p>
        </Card>
      ) : (
        <Alert tone="info">
          The trip is {readinessPercent}% ready. You don&rsquo;t have to wait for 100% to pray — this
          step is always here.
        </Alert>
      )}

      <Card className="p-5">
        <p className="font-display text-base font-bold text-navy">
          {attendeeCount} {attendeeCount === 1 ? "person" : "people"} on this trip
        </p>
        <p className="mt-1 text-sm text-navy-soft">
          Pray for them by name. The roster is one tap away if you want it in front of you.
        </p>
      </Card>

      <section>
        <h2 className="mb-1 font-display text-lg font-bold text-navy">Prayer focuses</h2>
        <p className="mb-3 text-sm text-navy-soft">
          Optional. Write what your team is carrying into this trip.
        </p>

        {focuses.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {focuses.map((focus) => (
              <Card as="li" key={focus.id} className="flex items-center justify-between gap-3 p-3">
                <span className="text-navy">{focus.text}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removePrayerFocusAction(focus.id);
                    })
                  }
                >
                  Remove
                </Button>
              </Card>
            ))}
          </ul>
        ) : null}

        <form action={action} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Add a focus">
            <Input name="text" placeholder="Safe travel" />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add
          </SubmitButton>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions
            .filter((s) => !focuses.some((f) => f.text.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => addSuggestion(s)}
                className="min-h-[44px] rounded-full border border-line bg-white px-3 py-1.5 text-sm text-navy-soft"
              >
                + {s}
              </button>
            ))}
        </div>
      </section>

      <form
        action={(formData) => complete(true, String(formData.get("notes") ?? ""))}
        className="space-y-3"
      >
        <Card className="p-4">
          <Field label="Notes from your time of prayer" hint="Optional. Only your leaders see this.">
            <Textarea name="notes" rows={4} defaultValue={notes} />
          </Field>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "We prayed over the group"}
        </Button>
        <p className="text-center text-xs text-navy-faint">
          This is the last preparation step. It isn&rsquo;t scored and it isn&rsquo;t shared outside
          your team.
        </p>
      </form>
    </div>
  );
}
