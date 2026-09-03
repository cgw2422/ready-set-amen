"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  confirmImportAction,
  previewImportAction,
  type ConfirmState,
  type PreviewState,
} from "@/lib/actions/import";
import { IMPORT_FIELDS, type ImportField, type RowStatus } from "@/lib/import/mapping";
import { Alert, Badge, Button, Card, LinkButton, Select } from "@/components/ui";
import { CheckBadge } from "@/components/brand";

/**
 * Upload, map, look, confirm.
 *
 * The file stays in the browser between steps and is posted again with the
 * confirmation, which is what lets the server re-validate every row instead of
 * trusting a preview it was handed — and means nothing a church uploads is ever
 * written to disk on our side.
 */

const STATUS_TONE: Record<RowStatus, "green" | "gold" | "coral" | "navy"> = {
  READY: "green",
  WARNING: "gold",
  ERROR: "coral",
  DUPLICATE: "navy",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  READY: "Ready",
  WARNING: "Warning",
  ERROR: "Error",
  DUPLICATE: "Possible duplicate",
};

export function ImportFlow({
  slug,
  tripId,
  googleSheetsUrl,
}: {
  slug: string;
  tripId: string;
  googleSheetsUrl: string | null;
}) {
  const preview = previewImportAction.bind(null, tripId);
  const confirm = confirmImportAction.bind(null, tripId);

  // The chosen file is held here rather than read back off the input, because
  // React clears an uncontrolled form once an action settles — which would
  // otherwise empty the file input the moment the preview came back, and leave
  // the leader with nothing to confirm.
  const [file, setFile] = useState<File | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const [confirmState, setConfirmState] = useState<ConfirmState>({ status: "idle" });
  const [pending, startAction] = useTransition();

  const [mapping, setMapping] = useState<Array<ImportField | null> | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  /** Both steps post the same file; only the extra fields differ. */
  const payload = (extra?: Record<string, string>) => {
    const body = new FormData();
    if (file) body.set("file", file);
    for (const [key, value] of Object.entries(extra ?? {})) body.set(key, value);
    return body;
  };

  const people = `/orgs/${slug}/trips/${tripId}/people`;

  if (confirmState.status === "done") {
    return (
      <Result
        state={confirmState}
        people={people}
        onAnother={() => {
          setFile(null);
          setPreviewState({ status: "idle" });
          setConfirmState({ status: "idle" });
          setMapping(null);
          setExcluded(new Set());
        }}
      />
    );
  }

  const ready = previewState.status === "ready" ? previewState.preview : null;
  const activeMapping = mapping ?? ready?.mapping ?? null;

  // ERROR rows can never be imported. Everything else is on unless the leader
  // turns it off, which is how a possible duplicate gets skipped.
  const importable = (ready?.rows ?? []).filter((row) => row.status !== "ERROR");
  const selected = importable.filter((row) => !excluded.has(row.line));

  const spots = ready?.freeSpotsLeft ?? null;
  const overLimit = spots !== null && selected.length > spots;

  return (
    <div className="space-y-4">
      <Link
        href={people}
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand"
      >
        &lsaquo; Back to people
      </Link>
      <h1 className="font-display text-2xl font-extrabold text-navy">Import people</h1>

      {/* ---------------------------------------------------------- step 1 */}
      <Card className="p-4">
        <p className="text-sm leading-relaxed text-navy-soft">
          Import your existing attendee list. Ready Set Amen accepts CSV and Excel spreadsheets.
          Required: <span className="font-semibold text-navy">First Name</span> and{" "}
          <span className="font-semibold text-navy">Last Name</span>. We&rsquo;ll help match the
          rest of your columns before anything is imported.
        </p>

        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-navy-soft">
          Need a template?
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <LinkButton
            href="/api/import-template/csv"
            variant="secondary"
            size="sm"
            prefetch={false}
          >
            Download CSV
          </LinkButton>
          <LinkButton
            href="/api/import-template/xlsx"
            variant="secondary"
            size="sm"
            prefetch={false}
          >
            Download Excel
          </LinkButton>
          {googleSheetsUrl ? (
            <a
              href={googleSheetsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center rounded-xl border border-line bg-white px-3 text-sm font-semibold text-navy hover:bg-cream"
            >
              Open Google Sheets Template
            </a>
          ) : null}
        </div>
        {googleSheetsUrl ? (
          <p className="mt-2 text-xs text-navy-faint">
            Make your own copy, fill it in, then download it as CSV or Excel and upload it here.
            Ready Set Amen never needs access to your Google account.
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-navy">
              Your spreadsheet
            </span>
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setMapping(null);
                setExcluded(new Set());
                setPreviewState({ status: "idle" });
                setConfirmState({ status: "idle" });
              }}
              className="block w-full rounded-xl border border-line bg-white p-2.5 text-navy file:mr-3 file:rounded-lg file:border-0 file:bg-green-soft file:px-3 file:py-2 file:font-semibold file:text-green-deep"
            />
          </label>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending || !file}
            onClick={() =>
              startAction(async () => {
                setConfirmState({ status: "idle" });
                setPreviewState(
                  await preview(
                    { status: "idle" },
                    payload(activeMapping ? { mapping: JSON.stringify(activeMapping) } : undefined),
                  ),
                );
              })
            }
          >
            {pending ? "Reading your file…" : ready ? "Re-read with these columns" : "Continue"}
          </Button>
        </div>

        {previewState.status === "error" ? (
          <div className="mt-3">
            <Alert tone="error">{previewState.error}</Alert>
          </div>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- step 2 */}
      {ready ? (
        <Card className="p-4">
          <p className="font-display text-base font-bold text-navy">Match your columns</p>
          <p className="mt-1 text-sm text-navy-soft">
            We recognised what we could. Set anything marked <em>Ignore this column</em> that you
            want brought in.
          </p>

          <div className="mt-3 space-y-2">
            {ready.headers.map((heading, index) => (
              <div key={`${heading}-${index}`} className="grid gap-1.5 sm:grid-cols-2 sm:items-center">
                <p className="min-w-0 truncate text-sm font-semibold text-navy">
                  {heading || <span className="text-navy-faint">(no heading)</span>}
                </p>
                <Select
                  aria-label={`Import "${heading}" as`}
                  value={activeMapping?.[index] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    const next = [...(activeMapping ?? ready.mapping)];
                    next[index] = value === "" ? null : (value as ImportField);
                    // One source column per field: picking a field frees it
                    // from wherever it was, rather than importing twice.
                    if (value !== "") {
                      next.forEach((field, i) => {
                        if (i !== index && field === value) next[i] = null;
                      });
                    }
                    setMapping(next);
                  }}
                >
                  <option value="">Ignore this column</option>
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                      {"required" in field && field.required ? " (required)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          {mapping ? (
            <p className="mt-3 text-sm text-navy-soft">
              Press <span className="font-semibold text-navy">Re-read with these columns</span>{" "}
              above to see the updated preview.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- step 3 */}
      {ready ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-base font-bold text-navy">Preview</p>
            <p className="text-sm text-navy-soft">
              {ready.counts.ready} ready · {ready.counts.warning} warning ·{" "}
              {ready.counts.duplicate} possible duplicate · {ready.counts.error} error
            </p>
          </div>

          {spots !== null ? (
            <div className="mt-3">
              <Alert tone={overLimit ? "warning" : "info"}>
                Free Setup includes up to 10 attendees. You currently have {ready.attendeeCount}{" "}
                {ready.attendeeCount === 1 ? "person" : "people"}, so you can add {spots} more
                before unlocking lifetime access.
                {overLimit ? (
                  <>
                    {" "}
                    You have {selected.length} selected — turn some off, or unlock Ready Set Amen to
                    import them all.
                  </>
                ) : null}
              </Alert>
            </div>
          ) : null}

          <ul className="mt-3 space-y-2">
            {ready.rows.map((row) => {
              const blocked = row.status === "ERROR";
              const on = !blocked && !excluded.has(row.line);
              return (
                <li
                  key={row.line}
                  className={`rounded-xl border p-3 ${
                    blocked ? "border-coral/40 bg-coral-soft/40" : "border-line bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">
                        {row.attendee.firstName || row.attendee.lastName
                          ? `${row.attendee.firstName} ${row.attendee.lastName}`.trim()
                          : `Row ${row.line}`}
                      </p>
                      <p className="mt-0.5 text-xs text-navy-faint">
                        Row {row.line} · {row.attendee.isMinor ? "Minor" : "Adult"}
                        {row.attendee.isLeader ? " · Leader" : ""}
                        {row.attendee.phone ? ` · ${row.attendee.phone}` : ""}
                        {row.attendee.email ? ` · ${row.attendee.email}` : ""}
                      </p>
                      {row.attendee.guardianName || row.attendee.emergencyContactName ? (
                        <p className="mt-0.5 text-xs text-navy-faint">
                          {row.attendee.guardianName ? `Guardian: ${row.attendee.guardianName}` : ""}
                          {row.attendee.guardianName && row.attendee.emergencyContactName
                            ? " · "
                            : ""}
                          {row.attendee.emergencyContactName
                            ? `Emergency: ${row.attendee.emergencyContactName}`
                            : ""}
                        </p>
                      ) : null}
                      {row.messages.length > 0 ? (
                        <p className="mt-1 text-xs font-semibold text-navy-soft">
                          {row.messages.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </div>

                  {blocked ? (
                    <p className="mt-2 text-xs font-semibold text-coral-deep">
                      This row will not be imported.
                    </p>
                  ) : (
                    <label className="mt-2 flex min-h-[36px] items-center gap-2 text-sm text-navy">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(event) => {
                          const next = new Set(excluded);
                          if (event.target.checked) next.delete(row.line);
                          else next.add(row.line);
                          setExcluded(next);
                        }}
                        className="h-5 w-5 rounded border-2 border-navy-faint accent-[#106b4d]"
                      />
                      Import this person
                    </label>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-4">
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={pending || selected.length === 0 || overLimit}
              onClick={() =>
                // The file is posted again so the server validates every row
                // itself rather than trusting anything the browser worked out.
                startAction(async () => {
                  setConfirmState(
                    await confirm(
                      { status: "idle" },
                      payload({
                        mapping: JSON.stringify(activeMapping ?? ready.mapping),
                        include: selected.map((row) => row.line).join(","),
                      }),
                    ),
                  );
                })
              }
            >
              {pending
                ? "Importing…"
                : `Import ${selected.length} ${selected.length === 1 ? "person" : "people"}`}
            </Button>
          </div>

          {confirmState.status === "error" ? (
            <div className="mt-3">
              <Alert tone="error">{confirmState.error}</Alert>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-navy-faint">
            Your file is read to build this preview and is not kept afterwards.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Result({
  state,
  people,
  onAnother,
}: {
  state: Extract<ConfirmState, { status: "done" }>;
  people: string;
  onAnother: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        <div className="flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-brand text-white">
            <CheckBadge className="h-10 w-10 bg-transparent" />
          </span>
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-navy">People added</h1>
        <p className="mt-2 text-navy-soft">
          {state.added} {state.added === 1 ? "person was" : "people were"} added successfully.
        </p>
        {state.skipped > 0 ? (
          <p className="mt-1 text-sm text-navy-soft">
            {state.skipped} {state.skipped === 1 ? "row" : "rows"} skipped.
          </p>
        ) : null}
        {state.needAttention > 0 ? (
          <p className="mt-1 text-sm text-navy-soft">
            {state.needAttention} {state.needAttention === 1 ? "row needs" : "rows need"} attention
            — they are on the trip and will show up in your outstanding items.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <LinkButton href={people} size="lg" className="flex-1">
            View people
          </LinkButton>
          <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={onAnother}>
            Import another file
          </Button>
        </div>
      </Card>
    </div>
  );
}
