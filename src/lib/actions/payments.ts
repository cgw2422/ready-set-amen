"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAttendee, requireTrip } from "@/lib/access";
import { toNumber } from "@/lib/trip-data";
import type { FormState } from "@/lib/actions/auth";
import type { PaymentStatus } from "@prisma/client";

/** Derived from the numbers so a leader never has to keep the two in sync. */
function deriveStatus(
  due: number,
  paid: number,
  manual: PaymentStatus | null,
  depositAmount: number | null,
): PaymentStatus {
  if (manual === "SCHOLARSHIP" || manual === "WAIVED") return manual;
  if (due <= 0) return "PAID";
  if (paid <= 0) return "UNPAID";
  if (paid >= due) return "PAID";
  if (depositAmount && paid >= depositAmount) return "DEPOSIT_PAID";
  return "PARTIAL";
}

const paymentSchema = z.object({
  amount: z.number().finite(),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function recordPaymentAction(
  attendeeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const attendee = await requireAttendee(attendeeId);
  const ctx = await requireTrip(attendee.tripId);

  const raw = String(formData.get("amount") ?? "").replace(/[^0-9.\-]/g, "");
  const parsed = paymentSchema.safeParse({
    amount: Number(raw),
    method: formData.get("method") ?? undefined,
    reference: formData.get("reference") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success || !Number.isFinite(parsed.data.amount) || parsed.data.amount === 0) {
    return { error: "Enter an amount." };
  }

  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: attendee.tripId },
    select: { depositAmount: true },
  });

  const nextPaid = toNumber(attendee.amountPaid) + parsed.data.amount;
  const due = toNumber(attendee.amountDue);

  await prisma.$transaction([
    prisma.paymentRecord.create({
      data: {
        attendeeId,
        amount: parsed.data.amount,
        method: parsed.data.method?.trim() || null,
        reference: parsed.data.reference?.trim() || null,
        note: parsed.data.note?.trim() || null,
        recordedBy: ctx.userId,
      },
    }),
    prisma.attendee.update({
      where: { id: attendeeId },
      data: {
        amountPaid: nextPaid,
        paymentStatus: deriveStatus(
          due,
          nextPaid,
          attendee.paymentStatus === "SCHOLARSHIP" || attendee.paymentStatus === "WAIVED"
            ? attendee.paymentStatus
            : null,
          toNumber(trip.depositAmount) || null,
        ),
      },
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/payments`);
  return { ok: true };
}

export async function setAttendeePaymentAction(
  attendeeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const attendee = await requireAttendee(attendeeId);
  const ctx = await requireTrip(attendee.tripId);

  const due = Number(String(formData.get("amountDue") ?? "").replace(/[^0-9.]/g, ""));
  const status = String(formData.get("paymentStatus") ?? "");
  const allowed: PaymentStatus[] = [
    "UNPAID",
    "DEPOSIT_PAID",
    "PARTIAL",
    "PAID",
    "SCHOLARSHIP",
    "WAIVED",
  ];
  if (!allowed.includes(status as PaymentStatus)) return { error: "Choose a payment status." };
  if (!Number.isFinite(due) || due < 0) return { error: "Enter a valid amount due." };

  await prisma.attendee.update({
    where: { id: attendeeId },
    data: { amountDue: due, paymentStatus: status as PaymentStatus },
  });

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/payments`);
  return { ok: true };
}

export async function deletePaymentAction(paymentId: string): Promise<FormState> {
  const payment = await prisma.paymentRecord.findUniqueOrThrow({
    where: { id: paymentId },
    select: { id: true, amount: true, attendeeId: true },
  });
  const attendee = await requireAttendee(payment.attendeeId);
  const ctx = await requireTrip(attendee.tripId);

  const nextPaid = Math.max(0, toNumber(attendee.amountPaid) - toNumber(payment.amount));
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: attendee.tripId },
    select: { depositAmount: true },
  });

  await prisma.$transaction([
    prisma.paymentRecord.delete({ where: { id: paymentId } }),
    prisma.attendee.update({
      where: { id: attendee.id },
      data: {
        amountPaid: nextPaid,
        paymentStatus: deriveStatus(
          toNumber(attendee.amountDue),
          nextPaid,
          attendee.paymentStatus === "SCHOLARSHIP" || attendee.paymentStatus === "WAIVED"
            ? attendee.paymentStatus
            : null,
          toNumber(trip.depositAmount) || null,
        ),
      },
    }),
  ]);

  revalidatePath(`/orgs/${ctx.organization.slug}/trips/${attendee.tripId}/payments`);
  return { ok: true };
}
