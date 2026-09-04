"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui";

/**
 * One save result, shown the same way everywhere.
 *
 * The problem this solves: a leader who has scrolled to the bottom of a long
 * settings page taps Save, the confirmation renders at the top, and nothing
 * they can see changes. So on success this scrolls itself into view and takes
 * focus, which both shows the confirmation and announces it to a screen reader.
 *
 * A failure deliberately does NOT move the page. Someone who just typed into a
 * field at the bottom should stay there with their work intact — `SaveError`
 * puts the reason next to the button they pressed instead.
 *
 * The effect depends on the whole state object rather than on `ok`, because
 * `useActionState` returns a fresh object for every submission: two saves in a
 * row both report `ok: true`, and the second one still has to be visible.
 */

export type SaveState = { ok?: boolean; error?: string };

export function SaveStatus({
  state,
  savedMessage = "Saved.",
  errorTitle = "Couldn't save your changes.",
}: {
  state: SaveState;
  savedMessage?: string;
  errorTitle?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    const node = ref.current;
    if (!node) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    // preventScroll, or focus would fight the smooth scroll it just started.
    node.focus({ preventScroll: true });
  }, [state]);

  if (!state.ok && !state.error) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-save-status={state.error ? "error" : "saved"}
      className="scroll-mt-4 outline-none"
    >
      {state.error ? (
        <Alert tone="error" title={errorTitle}>
          {state.error}
        </Alert>
      ) : (
        <Alert tone="success">{savedMessage}</Alert>
      )}
    </div>
  );
}

/**
 * The same failure, repeated beside the submit button.
 *
 * On a long form the button is often the only thing on screen when a save
 * fails, so this is what makes the tap feel like it did something. It is
 * intentionally quiet on success — the banner above handles that.
 */
export function SaveError({ state }: { state: SaveState }) {
  if (!state.error) return null;
  return (
    <p role="alert" data-save-error className="mt-2 text-sm font-semibold text-coral-deep">
      Couldn&rsquo;t save your changes. {state.error}
    </p>
  );
}
