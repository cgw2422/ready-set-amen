"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "You have unsaved changes" — for the three forms where losing the work
 * actually costs something: the waiver builder, trip settings, and a person's
 * details.
 *
 * Deliberately small. Two things are covered:
 *
 *   1. Closing or reloading the tab, and following a link off the site, which
 *      the browser's own `beforeunload` dialog handles.
 *   2. Following a link inside the app — a client-side navigation, which never
 *      fires `beforeunload` at all. Those are caught in the capture phase
 *      before the router sees the click.
 *
 * Not covered: the browser's back button. The App Router gives no supported way
 * to block a history pop, and faking one by pushing entries makes the back
 * button behave strangely for everyone, including people with nothing to lose.
 * A guard that is wrong half the time trains people to click through it.
 */

const MESSAGE = "You have unsaved changes. Leave this page and lose them?";

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // The browser shows its own wording; ours is only for the in-app case.
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      // A modified click opens a new tab, so this page is not going anywhere.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      // Leaving the site fires beforeunload, and an anchor on this page is not
      // navigation at all — neither needs asking twice.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      if (!window.confirm(MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

/**
 * The same guard for an uncontrolled form, where "dirty" cannot be derived by
 * comparing state: any input or change inside the form marks it, and a
 * successful save clears it.
 *
 * A rejected save starts dirty on purpose. The values on screen are the ones
 * the leader typed and the server refused, so they are still unsaved work.
 */
export function useDirtyForm(
  formRef: React.RefObject<HTMLFormElement | null>,
  state: { ok?: boolean; submitted?: Record<string, string> },
) {
  const [dirty, setDirty] = useState(false);
  const lastState = useRef(state);

  if (lastState.current !== state) {
    lastState.current = state;
    // Reacting to a settled action during render rather than in an effect, so
    // the guard is never briefly wrong right after a save.
    setDirty(Boolean(state.submitted) && !state.ok);
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const mark = () => setDirty(true);
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
    return () => {
      form.removeEventListener("input", mark);
      form.removeEventListener("change", mark);
    };
    // The form element itself is replaced when a rejected save restores values.
  }, [formRef, state]);

  useUnsavedChanges(dirty);
  return dirty;
}
