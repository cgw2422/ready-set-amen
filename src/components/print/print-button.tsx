"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-cream px-4 py-3">
      <p className="text-sm text-navy-soft">
        Use your browser&rsquo;s print dialog and choose <strong>Save as PDF</strong> to keep a copy.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => window.print()}>
          Print
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>
    </div>
  );
}
