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

type Snapshot = { versionNumber?: number; content?: unknown; capturedAt?: string };

/**
 * Renders a signed waiver from its own immutable snapshot — never from the live
 * template. A copy printed years later shows the words that were signed.
 */
export function SignedWaiverDocument({
  record,
  tripName,
  organizationName,
  showMedical = true,
}: {
  record: SignedWaiverRecord;
  tripName: string;
  organizationName: string;
  showMedical?: boolean;
}) {
  const snapshot = (record.documentSnapshot ?? {}) as Snapshot;
  const parsed = waiverContentSchema.safeParse(snapshot.content);
  const sections = parsed.success ? enabledSections(parsed.data) : [];
  const acknowledgements = Array.isArray(record.acknowledgements)
    ? (record.acknowledgements as { key: string; label: string; checked: boolean }[])
    : [];

  const medicalKeys = new Set([
    "allergies",
    "medicalConditions",
    "medications",
    "dietaryRestrictions",
    "insuranceProvider",
    "insurancePolicyNumber",
    "doctorName",
    "doctorPhone",
  ]);
  const responses = record.responses.filter(
    (r) => r.value.trim().length > 0 && (showMedical || !medicalKeys.has(r.fieldKey)),
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
        <h1 className="font-display text-2xl font-extrabold">
          {parsed.success ? parsed.data.waiverTitle : "Signed waiver"}
        </h1>
        <p className="text-sm text-navy-soft">
          {parsed.success ? parsed.data.organizationName : organizationName} · {tripName}
        </p>
        <p className="mt-1 text-xs text-navy-faint">
          Signed waiver ID {record.id} · document version {snapshot.versionNumber ?? "—"} · content
          hash {record.documentHash.slice(0, 16)}…
        </p>
      </header>

      <section className="print-avoid-break rounded-xl border border-line p-4">
        <h2 className="font-display text-base font-bold">Signature record</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Participant" value={record.participantNameAtSigning} />
          <Row
            label="Participant date of birth"
            value={record.participantDateOfBirth ? formatDate(record.participantDateOfBirth) : "—"}
          />
          <Row label="Signed by" value={record.signerName} />
          <Row
            label="Capacity"
            value={
              record.signerRole === "SELF"
                ? "Participant (signing for themselves)"
                : `Parent / legal guardian — ${record.signerRelationship}`
            }
          />
          <Row label="Signer email" value={record.signerEmail ?? "—"} />
          <Row label="Signer phone" value={record.signerPhone ?? "—"} />
          <Row label="Signed at" value={formatDateTime(record.signedAt)} />
          <Row label="IP address" value={record.ipAddress ?? "—"} />
        </dl>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

        <p className="mt-4 rounded-lg bg-cream px-3 py-2 text-xs text-navy-soft">
          <span className="font-semibold">Electronic records consent:</span> {record.consentText}
        </p>
        {record.userAgent ? (
          <p className="mt-2 break-words text-[10px] text-navy-faint">Device: {record.userAgent}</p>
        ) : null}
      </section>

      {acknowledgements.length > 0 ? (
        <section className="print-avoid-break">
          <h2 className="font-display text-base font-bold">Acknowledgements</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {acknowledgements.map((ack) => (
              <li key={ack.key} className="flex gap-2">
                <span aria-hidden="true">{ack.checked ? "☑" : "☐"}</span>
                <span>{ack.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {responses.length > 0 ? (
        <section className="print-avoid-break">
          <h2 className="font-display text-base font-bold">Information provided</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {responses.map((r) => (
              <Row key={r.id} label={r.fieldLabel} value={r.value} />
            ))}
          </dl>
        </section>
      ) : null}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-faint">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
