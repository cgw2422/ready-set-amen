"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  adoptLatestVersionAction,
  emailSigningLinkAction,
  generateLinksForUnsignedAction,
  generateSigningLinkAction,
  setWaiverNotRequiredAction,
  type LinkResult,
} from "@/lib/actions/waivers";
import { Alert, Badge, Button, Card, Checkbox } from "@/components/ui";

type Recipient = {
  id: string;
  status: string;
  signerRole: "SELF" | "GUARDIAN";
  signedWaiverId: string | null;
  attendeeId: string;
  name: string;
  isMinor: boolean;
  contact: string | null;
  guardianName: string | null;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unsigned", label: "Unsigned" },
  { value: "signed", label: "Signed" },
  { value: "viewed", label: "Viewed" },
  { value: "not-sent", label: "Not sent" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  NOT_SENT: "Not sent",
  SENT: "Sent",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  NOT_REQUIRED: "Not required",
  SUPERSEDED: "Needs new version",
};

const STATUS_TONE: Record<string, "green" | "gold" | "coral" | "muted"> = {
  NOT_SENT: "coral",
  SENT: "gold",
  VIEWED: "gold",
  SIGNED: "green",
  NOT_REQUIRED: "muted",
  SUPERSEDED: "coral",
};

export function WaiverDashboard({
  tripId,
  base,
  orgSlug,
  requirement,
  recipients,
  emailAvailable,
}: {
  tripId: string;
  base: string;
  orgSlug: string;
  requirement: {
    id: string;
    title: string;
    versionNumber: number;
    latestVersionNumber: number;
    templateId: string;
    templateName: string;
  };
  recipients: Recipient[];
  emailAvailable: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<LinkResult[]>([]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const required = recipients.filter((r) => r.status !== "NOT_REQUIRED");
  const signed = required.filter((r) => r.status === "SIGNED");
  const outstanding = required.filter((r) => r.status !== "SIGNED");
  const sent = required.filter((r) => r.status === "SENT" || r.status === "VIEWED");
  const viewed = required.filter((r) => r.status === "VIEWED");

  const visible = recipients.filter((r) => {
    switch (filter) {
      case "unsigned":
        return r.status !== "SIGNED" && r.status !== "NOT_REQUIRED";
      case "signed":
        return r.status === "SIGNED";
      case "viewed":
        return r.status === "VIEWED";
      case "not-sent":
        return r.status === "NOT_SENT";
      default:
        return true;
    }
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async (text: string, note: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: "success", text: note });
    } catch {
      setMessage({
        tone: "error",
        text: "Your browser blocked the clipboard — select the link below and copy it manually.",
      });
    }
  };

  const generateOne = (recipient: Recipient) =>
    startTransition(async () => {
      try {
        const result = await generateSigningLinkAction(recipient.id);
        setLinks([result]);
        await copy(result.url, `Signing link for ${result.name} copied.`);
      } catch {
        setMessage({ tone: "error", text: "We couldn't create that link. Please try again." });
      }
    });

  const generateBulk = (ids?: string[]) =>
    startTransition(async () => {
      try {
        const results = await generateLinksForUnsignedAction(tripId, ids);
        setLinks(results);
        if (results.length === 0) {
          setMessage({ tone: "success", text: "Everyone has already signed. Nothing to send." });
          return;
        }
        const text = results.map((r) => `${r.name}: ${r.url}`).join("\n");
        await copy(
          text,
          `${results.length} signing link${results.length === 1 ? "" : "s"} copied. Paste them into your group text or email.`,
        );
        setSelected(new Set());
      } catch {
        setMessage({ tone: "error", text: "We couldn't create those links. Please try again." });
      }
    });

  const email = (recipient: Recipient) =>
    startTransition(async () => {
      const result = await emailSigningLinkAction(recipient.id);
      setMessage(
        result.ok
          ? { tone: "success", text: `Waiver email sent for ${recipient.name}.` }
          : { tone: "error", text: result.error ?? "That email didn't send." },
      );
    });

  const setNotRequired = (recipient: Recipient, value: boolean) =>
    startTransition(async () => {
      const result = await setWaiverNotRequiredAction(recipient.id, value);
      if (result.error) setMessage({ tone: "error", text: result.error });
    });

  const adopt = () =>
    startTransition(async () => {
      const result = await adoptLatestVersionAction(requirement.id);
      setMessage(
        result.ok
          ? {
              tone: "success",
              text: `This trip now uses version ${requirement.latestVersionNumber}. Unsigned links were reset.`,
            }
          : { tone: "error", text: result.error ?? "Couldn't update the version." },
      );
    });

  return (
    <section className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-navy">{requirement.title}</p>
            <p className="text-sm text-navy-soft">
              Using version {requirement.versionNumber} of{" "}
              <Link
                href={`/orgs/${orgSlug}/waivers/${requirement.templateId}`}
                className="font-semibold text-green-brand underline"
              >
                {requirement.templateName}
              </Link>
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-extrabold text-navy">
              {signed.length} / {required.length}
            </p>
            <p className="text-xs text-navy-faint">signed</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Required", value: required.length },
            { label: "Outstanding", value: outstanding.length },
            { label: "Sent", value: sent.length },
            { label: "Viewed", value: viewed.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-cream px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-navy-faint">
                {stat.label}
              </dt>
              <dd className="font-display text-xl font-bold text-navy">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {requirement.latestVersionNumber > requirement.versionNumber ? (
          <div className="mt-4">
            <Alert tone="warning" title="A newer version of this waiver exists">
              <p>
                This trip is on version {requirement.versionNumber}; the library is on version{" "}
                {requirement.latestVersionNumber}. Adopting it keeps every existing signature exactly
                as signed and asks only unsigned people for the new wording.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={pending}
                onClick={adopt}
              >
                Adopt version {requirement.latestVersionNumber}
              </Button>
            </Alert>
          </div>
        ) : null}
      </Card>

      {message ? (
        <Alert tone={message.tone === "success" ? "success" : "error"}>{message.text}</Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || outstanding.length === 0}
          onClick={() => generateBulk()}
        >
          {pending ? "Working…" : `Copy links for all ${outstanding.length} unsigned`}
        </Button>
        {selected.size > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => generateBulk([...selected])}
          >
            Copy {selected.size} selected
          </Button>
        ) : null}
        <Link
          href={`/print/trip/${tripId}/unsigned-waivers`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-navy"
        >
          Print unsigned list
        </Link>
      </div>

      {links.length > 0 ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-navy">
              {links.length} link{links.length === 1 ? "" : "s"} ready
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinks([])}>
              Hide
            </Button>
          </div>
          <p className="mt-1 text-xs text-navy-faint">
            Each link is personal to one participant. Send it directly to that person or their
            parent — anyone who has the link can sign.
          </p>
          <textarea
            readOnly
            rows={Math.min(10, links.length + 1)}
            className="mt-3 w-full rounded-xl border border-line bg-cream px-3 py-2 font-mono text-xs text-navy"
            value={links.map((l) => `${l.name}: ${l.url}`).join("\n")}
            onFocus={(e) => e.currentTarget.select()}
          />
        </Card>
      ) : null}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${
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
        {visible.map((recipient) => {
          const unsigned = recipient.status !== "SIGNED" && recipient.status !== "NOT_REQUIRED";
          return (
            <Card as="li" key={recipient.id} className="p-3">
              <div className="flex items-start gap-3">
                {unsigned ? (
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(recipient.id)}
                    onChange={() => toggle(recipient.id)}
                    aria-label={`Select ${recipient.name}`}
                  />
                ) : (
                  <span className="mt-1 h-5 w-5" aria-hidden="true" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${base}/people/${recipient.attendeeId}`}
                      className="font-semibold text-navy underline decoration-transparent hover:decoration-inherit"
                    >
                      {recipient.name}
                    </Link>
                    <Badge tone={STATUS_TONE[recipient.status] ?? "muted"}>
                      {STATUS_LABEL[recipient.status] ?? recipient.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-navy-faint">
                    {recipient.signerRole === "GUARDIAN"
                      ? `Guardian signs${recipient.guardianName ? ` · ${recipient.guardianName}` : " · no guardian on file"}`
                      : "Signs for themselves"}
                    {recipient.contact ? ` · ${recipient.contact}` : ""}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {recipient.signedWaiverId ? (
                      <Link
                        href={`${base}/waivers/${recipient.signedWaiverId}`}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy"
                      >
                        View signed waiver
                      </Link>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending || recipient.status === "NOT_REQUIRED"}
                          onClick={() => generateOne(recipient)}
                        >
                          Copy link
                        </Button>
                        {emailAvailable && recipient.contact ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => email(recipient)}
                          >
                            Email link
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            setNotRequired(recipient, recipient.status !== "NOT_REQUIRED")
                          }
                        >
                          {recipient.status === "NOT_REQUIRED" ? "Mark required" : "Not required"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-navy-faint">
          Nobody matches that filter.
        </p>
      ) : null}
    </section>
  );
}
