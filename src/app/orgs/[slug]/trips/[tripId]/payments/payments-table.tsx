"use client";

import { useState, useTransition } from "react";
import { deletePaymentAction, recordPaymentAction, setAttendeePaymentAction } from "@/lib/actions/payments";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { formatDate, money } from "@/lib/format";

type Attendee = {
  id: string;
  name: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  payments: { id: string; amount: number; receivedAt: string; method: string | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  DEPOSIT_PAID: "Deposit paid",
  PARTIAL: "Partial",
  PAID: "Paid",
  SCHOLARSHIP: "Scholarship",
  WAIVED: "Waived",
};

const STATUS_TONE: Record<string, "green" | "gold" | "coral" | "muted"> = {
  UNPAID: "coral",
  DEPOSIT_PAID: "gold",
  PARTIAL: "gold",
  PAID: "green",
  SCHOLARSHIP: "muted",
  WAIVED: "muted",
};

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "owing", label: "Still owes" },
  { value: "paid", label: "Settled" },
];

export function PaymentsTable({
  attendees,
  initialFilter = "all",
}: {
  attendees: Attendee[];
  initialFilter?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.value === initialFilter) ? initialFilter : "all",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = attendees.filter((a) => {
    const owes = a.amountPaid < a.amountDue;
    if (filter === "owing") return owes && a.status !== "SCHOLARSHIP" && a.status !== "WAIVED";
    if (filter === "paid") return !owes || a.status === "SCHOLARSHIP" || a.status === "WAIVED";
    return true;
  });

  return (
    <section className="space-y-3">
      {message ? <Alert tone="error">{message}</Alert> : null}

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-semibold ${
              filter === f.value
                ? "border-green-brand bg-green-brand text-white"
                : "border-line bg-white text-navy-soft"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {visible.map((attendee) => {
          const owes = Math.max(0, attendee.amountDue - attendee.amountPaid);
          const isOpen = open === attendee.id;

          return (
            <Card as="li" key={attendee.id} className="p-3">
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
                onClick={() => setOpen(isOpen ? null : attendee.id)}
                aria-expanded={isOpen}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-navy">{attendee.name}</span>
                  <span className="block text-xs text-navy-faint">
                    {money(attendee.amountPaid)} of {money(attendee.amountDue)}
                    {owes > 0 ? ` · ${money(owes)} left` : ""}
                  </span>
                </span>
                <Badge tone={STATUS_TONE[attendee.status] ?? "muted"}>
                  {STATUS_LABEL[attendee.status] ?? attendee.status}
                </Badge>
              </button>

              {isOpen ? (
                <div className="mt-4 space-y-4 border-t border-line pt-4">
                  <form
                    action={async (formData) => {
                      const result = await recordPaymentAction(attendee.id, {}, formData);
                      setMessage(result.error ?? null);
                    }}
                    className="space-y-3"
                  >
                    <p className="font-semibold text-navy">Record a payment</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Amount" required>
                        <Input name="amount" inputMode="decimal" required placeholder="50" />
                      </Field>
                      <Field label="Method">
                        <Input name="method" placeholder="Cash, check, Venmo" />
                      </Field>
                      <Field label="Reference">
                        <Input name="reference" placeholder="Check #1042" />
                      </Field>
                    </div>
                    <Button type="submit" size="sm">
                      Add payment
                    </Button>
                  </form>

                  <form
                    action={async (formData) => {
                      const result = await setAttendeePaymentAction(attendee.id, {}, formData);
                      setMessage(result.error ?? null);
                    }}
                    className="space-y-3"
                  >
                    <p className="font-semibold text-navy">Adjust</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Amount due">
                        <Input
                          name="amountDue"
                          inputMode="decimal"
                          defaultValue={String(attendee.amountDue)}
                        />
                      </Field>
                      <Field label="Status">
                        <Select name="paymentStatus" defaultValue={attendee.status}>
                          {Object.entries(STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Button type="submit" size="sm" variant="secondary">
                      Save
                    </Button>
                  </form>

                  {attendee.payments.length > 0 ? (
                    <div>
                      <p className="font-semibold text-navy">History</p>
                      <ul className="mt-2 space-y-1.5">
                        {attendee.payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-navy">
                              {money(payment.amount)}
                              <span className="text-navy-faint">
                                {" "}
                                · {formatDate(new Date(payment.receivedAt))}
                                {payment.method ? ` · ${payment.method}` : ""}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await deletePaymentAction(payment.id);
                                  setMessage(result.error ?? null);
                                })
                              }
                            >
                              Undo
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </ul>
    </section>
  );
}
