"use client";

import { useState, useTransition } from "react";
import { generateSigningLinkAction, setWaiverNotRequiredAction } from "@/lib/actions/waivers";
import { Alert, Badge, Button, Card } from "@/components/ui";

export type QueueRecipient = {
  id: string;
  name: string;
  signerRole: "SELF" | "GUARDIAN";
  guardianName: string | null;
  contact: string | null;
  status: string;
};

/**
 * "Work through outstanding waivers" — the primary delivery flow.
 *
 * Each signing link is a personal credential for one participant, so copying
 * forty of them into a single clipboard blob is genuinely unsafe: pasted into a
 * group chat, every parent receives every other child's link. This queue hands
 * the leader exactly one link at a time and keeps their place, which is both
 * safer and faster than reconciling a wall of URLs by hand.
 */
export function WaiverQueue({
  recipients,
  onClose,
}: {
  recipients: QueueRecipient[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remaining = recipients.filter((r) => !done.has(r.id));
  const current = remaining[Math.min(index, remaining.length - 1)];

  const advance = () => {
    setCopiedUrl(null);
    setError(null);
    if (!current) return;
    setDone((prev) => new Set(prev).add(current.id));
    setIndex(0);
  };

  const copy = () => {
    if (!current) return;
    startTransition(async () => {
      try {
        const result = await generateSigningLinkAction(current.id);
        setCopiedUrl(result.url);
        try {
          await navigator.clipboard.writeText(result.url);
        } catch {
          // Clipboard can be blocked; the URL below is selectable as a fallback.
        }
      } catch {
        setError("We couldn't create that link. Please try again.");
      }
    });
  };

  const skip = () => {
    setCopiedUrl(null);
    setError(null);
    setIndex((i) => (i + 1 >= remaining.length ? 0 : i + 1));
  };

  const markNotRequired = () => {
    if (!current) return;
    startTransition(async () => {
      const result = await setWaiverNotRequiredAction(current.id, true);
      if (result.error) setError(result.error);
      else advance();
    });
  };

  if (!current) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-xl font-extrabold text-navy">That&rsquo;s everyone.</p>
        <p className="mt-1 text-sm text-navy-soft">
          You worked through all {recipients.length} outstanding{" "}
          {recipients.length === 1 ? "waiver" : "waivers"}.
        </p>
        <Button type="button" className="mt-4" onClick={onClose}>
          Back to the waiver list
        </Button>
      </Card>
    );
  }

  const position = recipients.length - remaining.length + 1;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-navy-soft">
          {position} of {recipients.length}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done for now
        </Button>
      </div>

      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
        <div
          className="h-full rounded-full bg-green-brand transition-all"
          style={{ width: `${((position - 1) / recipients.length) * 100}%` }}
        />
      </div>

      <div className="mt-5">
        <p className="font-display text-2xl font-extrabold leading-tight text-navy">
          {current.name}
        </p>
        <p className="mt-1 text-sm text-navy-soft">
          {current.signerRole === "GUARDIAN"
            ? `A parent or guardian signs${current.guardianName ? ` — ${current.guardianName}` : ""}`
            : "Signs for themselves"}
        </p>
        {current.contact ? (
          <p className="mt-1 select-all text-sm font-semibold text-navy">{current.contact}</p>
        ) : (
          <p className="mt-1 text-sm text-coral-deep">
            No email on file — send the link however you normally reach them.
          </p>
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {copiedUrl ? (
        <div className="mt-4 space-y-3">
          <Alert tone="success">
            Link copied. Send it to {current.name}
            {current.signerRole === "GUARDIAN" ? "'s parent" : ""} now — it&rsquo;s personal to them.
          </Alert>
          <input
            readOnly
            value={copiedUrl}
            aria-label={`Signing link for ${current.name}`}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-line bg-cream px-3 py-2 font-mono text-xs text-navy"
          />
          <Button type="button" size="lg" className="w-full" onClick={advance}>
            Sent — next person
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          className="mt-5 w-full"
          disabled={pending}
          onClick={copy}
        >
          {pending ? "Creating link…" : `Copy link for ${current.name}`}
        </Button>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={skip} disabled={pending}>
          Skip for now
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={markNotRequired}
          disabled={pending}
        >
          Not required
        </Button>
        <Badge tone="muted" className="ml-auto self-center">
          {remaining.length} left
        </Badge>
      </div>
    </Card>
  );
}
