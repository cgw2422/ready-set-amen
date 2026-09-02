"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Tap-to-assign bottom sheet. Chosen over drag-and-drop deliberately
 * (docs/ARCHITECTURE.md §10) — dragging a name into a van on a phone in a
 * parking lot is worse than tapping twice.
 */
export function AssignSheet({
  title,
  options,
  currentId,
  onSelect,
  onClose,
}: {
  title: string;
  options: { id: string; label: string; detail: string; full?: boolean }[];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-white pb-[calc(1rem+var(--safe-bottom))] animate-rise sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-3">
          <p className="font-display text-base font-bold text-navy">{title}</p>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <ul className="p-3">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={option.full}
                onClick={() => onSelect(option.id)}
                className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left ${
                  currentId === option.id ? "bg-green-soft" : "hover:bg-cream"
                } disabled:opacity-40`}
              >
                <span>
                  <span className="block font-semibold text-navy">{option.label}</span>
                  <span className="block text-xs text-navy-faint">
                    {option.detail}
                    {option.full ? " · full" : ""}
                  </span>
                </span>
                {currentId === option.id ? (
                  <span className="text-sm font-semibold text-green-deep">Current</span>
                ) : null}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="mt-1 flex min-h-[56px] w-full items-center rounded-xl px-3 py-3 text-left font-semibold text-coral-deep hover:bg-cream"
            >
              Unassign
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
