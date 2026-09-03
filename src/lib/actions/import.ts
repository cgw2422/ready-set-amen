"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { attendeeCount, requireTrip } from "@/lib/access";
import { freeAttendeeSpotsLeft, IMPORT_LIMITS } from "@/lib/entitlement";
import { isImportField, type ImportField, type ParsedRow } from "@/lib/import/mapping";
import { SpreadsheetError } from "@/lib/import/spreadsheet";
import { importAttendees, parseUpload, summarise, type Preview } from "@/lib/import/service";

/**
 * Two steps, deliberately separate.
 *
 * `previewImportAction` reads a file and returns what *would* happen. It writes
 * nothing, so a leader can upload, fix their column mapping, and look at the
 * result as many times as they like without touching their roster.
 *
 * `confirmImportAction` re-validates the rows the leader chose and writes only
 * those. It never trusts the preview it was handed: the file is re-parsed from
 * the same bytes the browser still holds, the mapping is checked against the
 * known fields, and the entitlement limit is applied under a lock. A modified
 * request can only ever create attendees on a trip the caller can already
 * reach, within the limit their church has.
 */

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ready"; preview: Preview };

async function fileBytes(formData: FormData): Promise<Buffer> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new SpreadsheetError("Choose a CSV or Excel file to import.");
  }
  if (file.size > IMPORT_LIMITS.maxBytes) {
    throw new SpreadsheetError(
      `That file is larger than ${Math.round(
        IMPORT_LIMITS.maxBytes / 1024 / 1024,
      )} MB. Export just the attendee sheet and try again.`,
    );
  }
  return Buffer.from(await file.arrayBuffer());
}

function readMapping(formData: FormData, columns: number): Array<ImportField | null> | null {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== columns) return null;
    return parsed.map((value) => (isImportField(value) ? value : null));
  } catch {
    return null;
  }
}

async function existingRoster(tripId: string) {
  return prisma.attendee.findMany({
    where: { tripId },
    select: { firstName: true, lastName: true, dateOfBirth: true },
  });
}

export async function previewImportAction(
  tripId: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const ctx = await requireTrip(tripId);

  try {
    const bytes = await fileBytes(formData);
    const existing = await existingRoster(tripId);

    // Parsed once to learn the column count, so a mapping the leader chose can
    // be validated against the real header row rather than assumed.
    const first = parseUpload(bytes, null, existing);
    const chosen = readMapping(formData, first.sheet.headers.length);
    const { sheet, mapping, rows } = chosen
      ? parseUpload(bytes, chosen, existing)
      : first;

    const count = await attendeeCount(ctx);
    return {
      status: "ready",
      preview: {
        headers: sheet.headers,
        mapping,
        rows,
        counts: summarise(rows),
        freeSpotsLeft: freeAttendeeSpotsLeft(ctx.organization, count),
        attendeeCount: count,
      },
    };
  } catch (error) {
    if (error instanceof SpreadsheetError) return { status: "error", error: error.message };
    // Never surface a parser's internals: the input is attacker-controlled.
    return {
      status: "error",
      error: "That file could not be read. Try saving it again as .csv or .xlsx.",
    };
  }
}

export type ConfirmState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "done"; added: number; skipped: number; needAttention: number };

export async function confirmImportAction(
  tripId: string,
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const ctx = await requireTrip(tripId);

  try {
    const bytes = await fileBytes(formData);
    const existing = await existingRoster(tripId);
    const columns = parseUpload(bytes, null, existing).sheet.headers.length;
    const { rows } = parseUpload(bytes, readMapping(formData, columns), existing);

    // Which rows the leader ticked. Anything not on the list is skipped, and an
    // ERROR row is never importable however the request is shaped.
    const selected = new Set(
      String(formData.get("include") ?? "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value)),
    );

    const importable = rows.filter((row) => row.status !== "ERROR" && selected.has(row.line));
    const outcome = await importAttendees(
      ctx,
      tripId,
      importable.map((row) => row.attendee),
      {
        skipped: rows.length - importable.length,
        needAttention: countNeedingAttention(importable),
        returnTo: `/orgs/${ctx.organization.slug}/trips/${tripId}/people/import`,
      },
    );

    revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/people`);
    revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}`);
    return { status: "done", ...outcome };
  } catch (error) {
    if (error instanceof SpreadsheetError) return { status: "error", error: error.message };
    if (error instanceof Error && error.message.includes("imports up to")) {
      return { status: "error", error: error.message };
    }
    throw error;
  }
}

function countNeedingAttention(rows: ParsedRow[]): number {
  return rows.filter((row) => row.status === "WARNING" || row.status === "DUPLICATE").length;
}
