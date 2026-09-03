import "server-only";
import { prisma } from "@/lib/db";
import { createWithAttendeeCapacity, type OrgContext } from "@/lib/access";
import { syncWaiverRecipients } from "@/lib/waiver-service";
import { IMPORT_LIMITS } from "@/lib/entitlement";
import {
  autoMap,
  validateRow,
  type AttendeeDraft,
  type ImportField,
  type ParsedRow,
} from "@/lib/import/mapping";
import { readSpreadsheet, type Sheet } from "@/lib/import/spreadsheet";

/**
 * The import, end to end.
 *
 * Nothing is written when a file is uploaded. Parsing produces a preview the
 * leader approves, and only the rows they confirm are turned into attendees.
 * The uploaded bytes are never stored: they live in the request that parsed
 * them and are gone when it returns, which is why confirming an import re-reads
 * the rows from the preview payload rather than from a file on disk.
 */

export type Preview = {
  headers: string[];
  mapping: Array<ImportField | null>;
  rows: ParsedRow[];
  counts: { ready: number; warning: number; error: number; duplicate: number };
  /** Null when the organization has no limit. */
  freeSpotsLeft: number | null;
  attendeeCount: number;
};

export function parseUpload(
  bytes: Buffer,
  chosenMapping: Array<ImportField | null> | null,
  existing: Array<{ firstName: string; lastName: string; dateOfBirth: Date | null }>,
): { sheet: Sheet; mapping: Array<ImportField | null>; rows: ParsedRow[] } {
  const sheet = readSpreadsheet(bytes);
  const mapping =
    chosenMapping && chosenMapping.length === sheet.headers.length
      ? chosenMapping
      : autoMap(sheet.headers);

  const seen: Array<{ firstName: string; lastName: string; dateOfBirth: Date | null }> = [];
  const rows = sheet.rows.map((cells, index) => {
    const row = validateRow(index + 2, cells, mapping, existing, seen);
    if (row.status !== "ERROR") {
      seen.push({
        firstName: row.attendee.firstName,
        lastName: row.attendee.lastName,
        dateOfBirth: row.attendee.dateOfBirth,
      });
    }
    return row;
  });

  return { sheet, mapping, rows };
}

export function summarise(rows: ParsedRow[]): Preview["counts"] {
  return {
    ready: rows.filter((r) => r.status === "READY").length,
    warning: rows.filter((r) => r.status === "WARNING").length,
    error: rows.filter((r) => r.status === "ERROR").length,
    duplicate: rows.filter((r) => r.status === "DUPLICATE").length,
  };
}

export type ImportOutcome = {
  added: number;
  skipped: number;
  needAttention: number;
};

/**
 * Writes the chosen rows. The count and the inserts happen under one
 * organization lock, so two confirmations submitted at once cannot push a free
 * church past ten people, and a batch that would exceed the limit is refused
 * before anything is written rather than half-applied.
 */
export async function importAttendees(
  ctx: OrgContext,
  tripId: string,
  drafts: AttendeeDraft[],
  options: { skipped: number; needAttention: number; returnTo: string },
): Promise<ImportOutcome> {
  if (drafts.length === 0) {
    return { added: 0, skipped: options.skipped, needAttention: options.needAttention };
  }
  if (drafts.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`Ready Set Amen imports up to ${IMPORT_LIMITS.maxRows} people at a time.`);
  }

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { costPerPerson: true },
  });
  const cost = trip.costPerPerson ? Number(trip.costPerPerson) : 0;

  const added = await createWithAttendeeCapacity(
    ctx,
    drafts.length,
    async (tx) => {
      let created = 0;
      for (const draft of drafts) {
        const attendee = await tx.attendee.create({
          data: {
            tripId,
            firstName: draft.firstName,
            lastName: draft.lastName,
            preferredName: draft.preferredName,
            gender: draft.gender,
            dateOfBirth: draft.dateOfBirth,
            isMinor: draft.isMinor,
            isLeader: draft.isLeader,
            phone: draft.phone,
            email: draft.email,
            emergencyContactName: draft.emergencyContactName,
            emergencyContactPhone: draft.emergencyContactPhone,
            allergies: draft.allergies,
            medicalConditions: draft.medicalConditions,
            medications: draft.medications,
            dietaryRestrictions: draft.dietaryRestrictions,
            shirtSize: draft.shirtSize,
            notes: draft.notes,
            amountDue: draft.paymentStatus === "SCHOLARSHIP" || draft.paymentStatus === "WAIVED" ? 0 : cost,
            amountPaid: draft.amountPaid ?? 0,
            paymentStatus: draft.paymentStatus ?? "UNPAID",
          },
          select: { id: true },
        });

        if (draft.guardianName || draft.guardianEmail || draft.guardianPhone) {
          await tx.guardian.create({
            data: {
              attendeeId: attendee.id,
              name: draft.guardianName ?? "Parent / Guardian",
              email: draft.guardianEmail,
              emailNormalized: draft.guardianEmail?.toLowerCase() ?? null,
              phone: draft.guardianPhone,
              isPrimary: true,
            },
          });
        }
        created += 1;
      }
      return created;
    },
    options.returnTo,
  );

  // Waiver recipients are derived from the roster, so they are refreshed once
  // after the batch rather than per person.
  await syncWaiverRecipients(tripId);

  return { added, skipped: options.skipped, needAttention: options.needAttention };
}

export type { Sheet };
