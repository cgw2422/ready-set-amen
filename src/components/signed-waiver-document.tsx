import { formatDate, formatDateTime } from "@/lib/format";
import { enabledSections, waiverContentSchema } from "@/lib/waiver-content";
import { WaiverText } from "@/components/waiver-text";

export type SignedWaiverRecord = {
  id: string;
  documentSnapshot: unknown;
  documentHash: string;
  participantNameAtSigning: string;
  participantDateOfBirth: Date | null;
  signerName: string;
  signerRole: "SELF" | "GUARDIAN";
  signerRelationship: string;
  signerEmail: string | null;
  signerPhone: string | null;
  typedSignature: string;
  drawnSignature: string | null;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  consentToElectronicRecords: boolean;
  consentText: string;
  acknowledgements: unknown;
  voidedAt: Date | null;
  voidReason: string | null;
  responses: { id: string; fieldKey: string; fieldLabel: string; value: string }[];
};

/** Delivery timeline from the recipient row, when the caller has it. */
export type SignedWaiverTimeline = {
  sentAt: Date | null;
  viewedAt: Date | null;
};

type Snapshot = { versionNumber?: number; content?: unknown; capturedAt?: string };

const MEDICAL_KEYS = new Set([
  "allergies",
  "medicalConditions",
  "medications",
  "dietaryRestrictions",
  "insuranceProvider",
  "insurancePolicyNumber",
  "doctorName",
  "doctorPhone",
]);

/**
 * Renders a signed waiver from its own immutable snapshot — never from the live
 * template — so a copy printed years later shows the words that were signed.
 *
 * The audit section is written to be read by a church administrator, not a
 * developer: plain labels first, technical evidence grouped at the end.
 */
export function SignedWaiverDocument({
  record,
  tripName,
  organizationName,
  timeline,
  showMedical = true,
}: {
  record: SignedWaiverRecord;
  tripName: string;
  organizationName: string;
  timeline?: SignedWaiverTimeline;
  showMedical?: boolean;
}) {
  const snapshot = (record.documentSnapshot ?? {}) as Snapshot;
  const parsed = waiverContentSchema.safeParse(snapshot.content);
  const sections = parsed.success ? enabledSections(parsed.data) : [];
  const acknowledgements = Array.isArray(record.acknowledgements)
    ? (record.acknowledgements as { key: string; label: string; checked: boolean }[])
    : [];
  const responses = record.responses.filter(
    (r) => r.value.trim().length > 0 && (showMedical || !MEDICAL_KEYS.has(r.fieldKey)),
  );

  return (
    <article className="space-y-6 text-navy">
      {record.voidedAt ? (
        <p className="rounded-xl border border-coral/40 bg-coral-soft px-4 py-3 text-sm font-semibold text-coral-deep">
          This signature was voided on {formatDate(record.voidedAt)}.
          {record.voidReason ? ` ${record.voidReason}` : ""}
        </p>
      ) : null}

      <header className="border-b border-line pb-4">
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.18em] text-green-brand">
          Signed waiver
        </p>
        <h1 className="font-display text-2xl font-extrabold">
          {parsed.success ? parsed.data.waiverTitle : "Signed waiver"}
        </h1>
        <p className="text-sm text-navy-soft">
          {parsed.success ? parsed.data.organizationName : organizationName} · {tripName}
        </p>
      </header>

      {/* 1. The record, in the order a person asks the questions -------------- */}
      <section className="print-avoid-break rounded-xl border-2 border-green-brand/25 bg-green-tint/40 p-4">
        <h2 className="font-display text-base font-bold">Signature record</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Signed by" value={record.signerName} emphasis />
          <Row label="Signing for" value={record.participantNameAtSigning} emphasis />
          <Row
            label="Relationship"
            value={
              record.signerRole === "SELF"
                ? "Self — the participant signed for themselves"
                : `${record.signerRelationship} (parent or legal guardian)`
            }
          />
          <Row label="Date and time signed" value={formatDateTime(record.signedAt)} emphasis />
          <Row label="Waiver version" value={`Version ${snapshot.versionNumber ?? "—"}`} />
          <Row label="Document ID" value={record.id} mono />
          {record.participantDateOfBirth ? (
            <Row
              label="Participant date of birth"
              value={formatDate(record.participantDateOfBirth)}
            />
          ) : null}
          <Row label="Signer contact" value={record.signerEmail ?? record.signerPhone ?? "—"} />
        </dl>

        <div className="mt-4 grid gap-4 border-t border-green-brand/20 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-faint">
              Typed signature
            </p>
            <p className="mt-1 font-display text-xl">{record.typedSignature}</p>
          </div>
          {record.drawnSignature ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-faint">
                Drawn signature
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.drawnSignature}
                alt={`Drawn signature of ${record.signerName}`}
                className="mt-1 max-h-24 border-b border-line"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* 2. Consent, stated as a confirmation ------------------------------- */}
      <section className="print-avoid-break rounded-xl border border-line p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">
          <span aria-hidden="true" className="text-green-brand">
            ✓
          </span>
          Electronic consent confirmed
        </h2>
        <p className="mt-1 text-sm text-navy-soft">
          {record.signerName} agreed to sign electronically on{" "}
          {formatDateTime(record.signedAt)}. They were shown this exact wording:
        </p>
        <blockquote className="mt-2 border-l-2 border-green-brand/40 pl-3 text-sm italic">
          {record.consentText}
        </blockquote>
      </section>

      {acknowledgements.length > 0 ? (
        <section className="print-avoid-break">
          <h2 className="font-display text-base font-bold">Acknowledgements</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {acknowledgements.map((ack) => (
              <li key={ack.key} className="flex gap-2">
                <span aria-hidden="true">{ack.checked ? "☑" : "☐"}</span>
                <span className={ack.checked ? "" : "text-navy-faint"}>{ack.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {responses.length > 0 ? (
        <section className="print-avoid-break">
          <h2 className="font-display text-base font-bold">Information provided</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {responses.map((r) => (
              <Row key={r.id} label={r.fieldLabel} value={r.value} />
            ))}
          </dl>
        </section>
      ) : null}

      {/* 3. Technical evidence, grouped and last ---------------------------- */}
      <section className="print-avoid-break rounded-xl border border-line bg-cream/60 p-4">
        <h2 className="font-display text-base font-bold">Audit information</h2>
        <p className="mt-1 text-xs text-navy-soft">
          Kept so this signature can be shown to be genuine later. The document hash proves the text
          below is byte-for-byte what was signed.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {timeline?.sentAt ? (
            <Row label="Link sent" value={formatDateTime(timeline.sentAt)} />
          ) : null}
          {timeline?.viewedAt ? (
            <Row label="First opened" value={formatDateTime(timeline.viewedAt)} />
          ) : null}
          <Row label="Signed" value={formatDateTime(record.signedAt)} />
          <Row label="IP address at signing" value={record.ipAddress ?? "Not recorded"} />
          <Row label="Document ID" value={record.id} mono />
          <Row label="Document hash (SHA-256)" value={record.documentHash} mono wrap />
          {snapshot.capturedAt ? (
            <Row label="Snapshot captured" value={formatDateTime(new Date(snapshot.capturedAt))} />
          ) : null}
        </dl>
        {record.userAgent ? (
          <p className="mt-3 break-words text-[11px] text-navy-faint">
            <span className="font-semibold">Device:</span> {record.userAgent}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-base font-bold">Document as signed</h2>
        {sections.length === 0 ? (
          <p className="mt-2 text-sm text-navy-faint">
            The stored document could not be rendered. The original content is preserved in this
            record.
          </p>
        ) : (
          <div className="mt-2 space-y-4">
            {sections.map((section) => (
              <div key={section.key} className="print-avoid-break">
                <h3 className="font-display text-sm font-bold">{section.heading}</h3>
                <WaiverText body={section.body} className="mt-1 text-sm" />
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function Row({
  label,
  value,
  emphasis,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-faint">{label}</dt>
      <dd
        className={`whitespace-pre-wrap ${emphasis ? "font-semibold" : ""} ${
          mono ? "font-mono text-xs" : ""
        } ${wrap ? "break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
