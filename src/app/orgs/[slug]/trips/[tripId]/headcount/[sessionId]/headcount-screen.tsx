"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  closeHeadcountAction,
  markAllPresentAction,
  resetHeadcountAction,
  toggleHeadcountRecordAction,
} from "@/lib/actions/headcount";
import { Alert, Button, Card } from "@/components/ui";

type Record = {
  attendeeId: string;
  name: string;
  isLeader: boolean;
  isMinor: boolean;
  phone: string | null;
  present: boolean;
};

/**
 * Rows are 64px tall and full width: this screen gets used while walking.
 */
export function HeadcountScreen({
  sessionId,
  label,
  startedAt,
  closed,
  backHref,
  records,
}: {
  sessionId: string;
  label: string;
  startedAt: string;
  closed: boolean;
  backHref: string;
  records: Record[];
}) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * The tally is real client state, not optimistic state.
   *
   * Counting fifty students is fifty taps in about a minute. Optimistic state
   * would revert on every settled transition unless the server re-rendered the
   * whole list each time, which cost about a second per person. Here the tap is
   * instant, the write goes out in the background, and a write that genuinely
   * fails is rolled back and surfaced rather than silently lost.
   */
  const [rows, setRows] = useState<Record[]>(records);
  const [unsaved, setUnsaved] = useState(0);

  const present = rows.filter((r) => r.present);
  const missing = rows.filter((r) => !r.present);
  const allHere = missing.length === 0;

  const setPresent = useCallback((attendeeId: string, value: boolean) => {
    setRows((current) =>
      current.map((r) => (r.attendeeId === attendeeId ? { ...r, present: value } : r)),
    );
  }, []);

  const toggle = useCallback(
    (record: Record) => {
      const next = !record.present;
      setPresent(record.attendeeId, next);
      setUnsaved((n) => n + 1);
      setSaveError(null);

      void toggleHeadcountRecordAction(sessionId, record.attendeeId, next)
        .then((result) => {
          if (result?.error) {
            setPresent(record.attendeeId, !next);
            setSaveError(`${record.name} didn't save. Tap again.`);
          }
        })
        .catch(() => {
          setPresent(record.attendeeId, !next);
          setSaveError(`${record.name} didn't save — check your signal and tap again.`);
        })
        .finally(() => setUnsaved((n) => Math.max(0, n - 1)));
    },
    [sessionId, setPresent],
  );

  return (
    <div className="space-y-4">
      <Link href={backHref} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand">
        &lsaquo; All headcounts
      </Link>

      <div
        className={`sticky top-[73px] z-10 rounded-2xl px-5 py-4 text-white ${
          allHere ? "bg-green-brand" : "bg-navy"
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-white/70">{label}</p>
        <p className="font-display text-4xl font-extrabold leading-none">
          {present.length} / {rows.length}
        </p>
        <p className="mt-1 text-sm text-white/80">
          {allHere ? "Everyone is accounted for." : `${missing.length} still missing`}
        </p>
        <p className="mt-1 text-xs text-white/60">Started {startedAt}</p>
      </div>

      {saveError ? <Alert tone="error">{saveError}</Alert> : null}

      {!allHere ? (
        <Alert tone="warning" title="Still missing">
          {missing.map((r) => r.name).join(", ")}
        </Alert>
      ) : null}

      <ul className="space-y-2">
        {rows.map((record) => (
          <li key={record.attendeeId}>
            <button
              type="button"
              disabled={closed}
              onClick={() => toggle(record)}
              aria-pressed={record.present}
              className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-2 px-4 text-left transition-colors ${
                record.present
                  ? "border-green-brand bg-green-soft"
                  : "border-line bg-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                  record.present
                    ? "border-green-brand bg-green-brand text-white"
                    : "border-navy-faint text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                  <path
                    d="M5 12.5 10 17.5 19 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold text-navy">{record.name}</span>
                {record.isLeader ? (
                  <span className="block text-xs text-navy-faint">Leader</span>
                ) : null}
              </span>
              {!record.present && record.phone ? (
                <a
                  href={`tel:${record.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-green-brand"
                >
                  Call
                </a>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || closed}
            onClick={() => {
              setRows((current) => current.map((r) => ({ ...r, present: false })));
              setBusy(true);
              void resetHeadcountAction(sessionId).finally(() => setBusy(false));
            }}
          >
            Reset
          </Button>

          {confirmAll ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={busy || closed}
                onClick={() => {
                  setRows((current) => current.map((r) => ({ ...r, present: true })));
                  setConfirmAll(false);
                  setBusy(true);
                  void markAllPresentAction(sessionId).finally(() => setBusy(false));
                }}
              >
                Yes, mark all {rows.length} present
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || closed}
              onClick={() => setConfirmAll(true)}
            >
              Mark all present
            </Button>
          )}

          {!closed ? (
            <form action={closeHeadcountAction.bind(null, sessionId)}>
              <Button type="submit" disabled={unsaved > 0}>
                {unsaved > 0 ? "Saving…" : "Save & close"}
              </Button>
            </form>
          ) : (
            <p className="self-center text-sm text-navy-faint">This count is closed.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
