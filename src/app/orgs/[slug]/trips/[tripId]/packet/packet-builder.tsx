"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Checkbox } from "@/components/ui";

export function PacketBuilder({
  tripId,
  sections,
  defaults,
  reports,
}: {
  tripId: string;
  sections: { key: string; label: string; sensitive: boolean }[];
  defaults: readonly string[];
  reports: { slug: string; label: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaults));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const href = `/print/trip/${tripId}/packet?sections=${[...selected].join(",")}`;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-base font-bold text-navy">What goes in the packet?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set(sections.map((s) => s.key)))}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set(defaults))}
            >
              Reset
            </Button>
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.key}>
              <label className="flex min-h-[48px] items-center gap-3 rounded-xl border border-line px-3 py-2">
                <Checkbox
                  checked={selected.has(section.key)}
                  onChange={() => toggle(section.key)}
                />
                <span className="flex-1 text-sm font-semibold text-navy">{section.label}</span>
                {section.sensitive ? <Badge tone="coral">Sensitive</Badge> : null}
              </label>
            </li>
          ))}
        </ul>

        {selected.has("medical") ? (
          <p className="mt-3 rounded-xl bg-coral-soft px-3 py-2 text-xs text-coral-deep">
            You&rsquo;ve included medical information. Keep the printed packet with a trip leader and
            destroy it after the trip.
          </p>
        ) : null}

        <Link
          href={href}
          className={`mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl px-4 font-semibold ${
            selected.size === 0
              ? "pointer-events-none bg-cream-deep text-navy-faint"
              : "bg-green-brand text-white"
          }`}
        >
          Generate trip packet
        </Link>
      </Card>

      <Card className="p-4">
        <p className="font-display text-base font-bold text-navy">Individual reports</p>
        <p className="mt-1 text-sm text-navy-soft">
          One-page printouts for the things you hand to a driver or carry on a clipboard.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {reports.map((report) => (
            <li key={report.slug}>
              <Link
                href={`/print/trip/${tripId}/${report.slug}`}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-semibold text-navy hover:bg-cream"
              >
                {report.label}
                <span aria-hidden="true" className="text-navy-faint">
                  &rsaquo;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
