"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createWithAttendeeCapacity, requireAttendee, requireTrip } from "@/lib/access";
import { parseDateInput } from "@/lib/format";
import { syncWaiverRecipients } from "@/lib/waiver-service";
import type { FormState } from "@/lib/actions/auth";

const attendeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  preferredName: z.string().trim().max(80).optional(),
  gender: z.string().trim().max(40).optional(),
  dateOfBirth: z.date().nullable(),
  isMinor: z.boolean(),
  isLeader: z.boolean(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(40).optional(),
  emergencyContactRelation: z.string().trim().max(80).optional(),
  allergies: z.string().trim().max(2000).optional(),
  medicalConditions: z.string().trim().max(2000).optional(),
  medications: z.string().trim().max(2000).optional(),
  dietaryRestrictions: z.string().trim().max(2000).optional(),
  insuranceProvider: z.string().trim().max(160).optional(),
  insurancePolicyNumber: z.string().trim().max(120).optional(),
  doctorName: z.string().trim().max(120).optional(),
  doctorPhone: z.string().trim().max(40).optional(),
  shirtSize: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(4000).optional(),
});

function blankToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readAttendeeForm(formData: FormData) {
  return attendeeSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    preferredName: formData.get("preferredName") ?? undefined,
    gender: formData.get("gender") ?? undefined,
    dateOfBirth: parseDateInput(formData.get("dateOfBirth")),
    isMinor: formData.get("isMinor") === "on" || formData.get("isMinor") === "true",
    isLeader: formData.get("isLeader") === "on" || formData.get("isLeader") === "true",
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    emergencyContactName: formData.get("emergencyContactName") ?? undefined,
    emergencyContactPhone: formData.get("emergencyContactPhone") ?? undefined,
    emergencyContactRelation: formData.get("emergencyContactRelation") ?? undefined,
    allergies: formData.get("allergies") ?? undefined,
    medicalConditions: formData.get("medicalConditions") ?? undefined,
    medications: formData.get("medications") ?? undefined,
    dietaryRestrictions: formData.get("dietaryRestrictions") ?? undefined,
    insuranceProvider: formData.get("insuranceProvider") ?? undefined,
    insurancePolicyNumber: formData.get("insurancePolicyNumber") ?? undefined,
    doctorName: formData.get("doctorName") ?? undefined,
    doctorPhone: formData.get("doctorPhone") ?? undefined,
    shirtSize: formData.get("shirtSize") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
}

function attendeeData(data: z.infer<typeof attendeeSchema>) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    preferredName: blankToNull(data.preferredName),
    gender: blankToNull(data.gender),
    dateOfBirth: data.dateOfBirth,
    isMinor: data.isMinor,
    isLeader: data.isLeader,
    phone: blankToNull(data.phone),
    email: blankToNull(data.email)?.toLowerCase() ?? null,
    emergencyContactName: blankToNull(data.emergencyContactName),
    emergencyContactPhone: blankToNull(data.emergencyContactPhone),
    emergencyContactRelation: blankToNull(data.emergencyContactRelation),
    allergies: blankToNull(data.allergies),
    medicalConditions: blankToNull(data.medicalConditions),
    medications: blankToNull(data.medications),
    dietaryRestrictions: blankToNull(data.dietaryRestrictions),
    insuranceProvider: blankToNull(data.insuranceProvider),
    insurancePolicyNumber: blankToNull(data.insurancePolicyNumber),
    doctorName: blankToNull(data.doctorName),
    doctorPhone: blankToNull(data.doctorPhone),
    shirtSize: blankToNull(data.shirtSize),
    notes: blankToNull(data.notes),
  };
}

async function upsertGuardian(attendeeId: string, formData: FormData) {
  const name = blankToNull(String(formData.get("guardianName") ?? ""));
  const email = blankToNull(String(formData.get("guardianEmail") ?? ""));
  const phone = blankToNull(String(formData.get("guardianPhone") ?? ""));
  const relationship = blankToNull(String(formData.get("guardianRelationship") ?? ""));

  const existing = await prisma.guardian.findFirst({
    where: { attendeeId, isPrimary: true },
    select: { id: true },
  });

  if (!name && !email && !phone) {
    if (existing) await prisma.guardian.delete({ where: { id: existing.id } });
    return;
  }

  const data = {
    name: name ?? "Parent / Guardian",
    email,
    emailNormalized: email?.toLowerCase() ?? null,
    phone,
    relationship,
    isPrimary: true,
  };

  if (existing) await prisma.guardian.update({ where: { id: existing.id }, data });
  else await prisma.guardian.create({ data: { ...data, attendeeId } });
}

/**
 * React 19 resets an uncontrolled form once its action settles, so a failed
 * save would otherwise wipe everything a leader had typed — every field, for a
 * form this long, because one of them was wrong. Returning the submitted values
 * lets the form put them straight back.
 */
export type AttendeeFormState = FormState & { submitted?: Record<string, string> };

function submittedValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function createAttendeeAction(
  tripId: string,
  _prev: AttendeeFormState,
  formData: FormData,
): Promise<AttendeeFormState> {
  const ctx = await requireTrip(tripId);

  // Validate before the capacity check so a typo is answered with a field
  // error rather than a payment screen.
  const parsed = readAttendeeForm(formData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      submitted: submittedValues(formData),
    };
  }

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { costPerPerson: true },
  });

  // The count and the insert happen under one lock, so two taps of Save cannot
  // both see nine people and make eleven.
  const attendee = await createWithAttendeeCapacity(
    ctx,
    1,
    (tx) =>
      tx.attendee.create({
        data: {
          tripId,
          ...attendeeData(parsed.data),
          amountDue: trip.costPerPerson ?? 0,
        },
        select: { id: true },
      }),
    `/orgs/${ctx.organization.slug}/trips/${tripId}/people`,
  );

  await upsertGuardian(attendee.id, formData);
  await syncWaiverRecipients(tripId);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/people`);

  // A redirect rather than a re-render: a brand new page cannot carry over a
  // stale field, a validation message, or the minor toggle.
  const people = `/orgs/${ctx.organization.slug}/trips/${tripId}/people`;
  if (formData.get("andAnother") === "true") redirect(`${people}/new?saved=1`);
  redirect(`${people}/new?added=${attendee.id}`);
}

export async function updateAttendeeAction(
  attendeeId: string,
  _prev: AttendeeFormState,
  formData: FormData,
): Promise<AttendeeFormState> {
  const attendee = await requireAttendee(attendeeId);
  const ctx = await requireTrip(attendee.tripId);

  const parsed = readAttendeeForm(formData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      submitted: submittedValues(formData),
    };
  }

  await prisma.attendee.update({
    where: { id: attendeeId },
    data: attendeeData(parsed.data),
  });
  await upsertGuardian(attendeeId, formData);
  await syncWaiverRecipients(attendee.tripId);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/people/${attendeeId}`);
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/people`);
  return { ok: true };
}

export async function deleteAttendeeAction(attendeeId: string): Promise<void> {
  const attendee = await requireAttendee(attendeeId);
  const ctx = await requireTrip(attendee.tripId);
  await prisma.attendee.delete({ where: { id: attendeeId } });
  redirect(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/people`);
}

/**
 * Fast roster entry. One person per line:
 *   First Last, minor|adult, phone/email, guardian email
 * Only the name is required — everything else is optional and positional.
 */
export async function quickAddAttendeesAction(
  tripId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTrip(tripId);
  const raw = String(formData.get("roster") ?? "");
  const defaultMinor = formData.get("defaultMinor") === "on";

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return { error: "Add at least one name." };
  if (lines.length > 300) return { error: "Add up to 300 people at a time." };

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { costPerPerson: true },
  });

  const created = await createWithAttendeeCapacity(
    ctx,
    lines.length,
    async (tx) => {
  let created = 0;
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const nameParts = (parts[0] ?? "").split(/\s+/).filter(Boolean);
    if (nameParts.length === 0) continue;

    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "—";

    let isMinor = defaultMinor;
    let phone: string | null = null;
    let email: string | null = null;
    let guardianEmail: string | null = null;

    for (const token of parts.slice(1)) {
      const value = token.trim();
      if (!value) continue;
      const lower = value.toLowerCase();
      if (lower === "minor" || lower === "student" || lower === "youth") isMinor = true;
      else if (lower === "adult" || lower === "leader") isMinor = false;
      else if (value.includes("@")) {
        if (email) guardianEmail = value.toLowerCase();
        else email = value.toLowerCase();
      } else if (/\d/.test(value)) phone = value;
    }

    // A minor's first email is almost always the parent's.
    if (isMinor && email && !guardianEmail) {
      guardianEmail = email;
      email = null;
    }

    const attendee = await tx.attendee.create({
      data: {
        tripId,
        firstName,
        lastName,
        isMinor,
        isLeader: /,\s*leader/i.test(line),
        phone,
        email,
        amountDue: trip.costPerPerson ?? 0,
      },
      select: { id: true },
    });

    if (guardianEmail) {
      await tx.guardian.create({
        data: {
          attendeeId: attendee.id,
          name: "Parent / Guardian",
          email: guardianEmail,
          emailNormalized: guardianEmail,
          isPrimary: true,
        },
      });
    }
    created += 1;
  }
      return created;
    },
    `/orgs/${ctx.organization.slug}/trips/${tripId}/people`,
  );

  await syncWaiverRecipients(tripId);
  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${tripId}/people`);
  redirect(`/orgs/${ctx.organization.slug}/trips/${tripId}/people?added=${created}`);
}
