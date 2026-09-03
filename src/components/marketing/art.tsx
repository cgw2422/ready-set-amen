/**
 * Small decorative pieces for the marketing site: phone mockups that match the
 * real product, and the travel details around them. All of it is inline SVG or
 * plain markup — no images to fetch, no icon library, no stock photography.
 * Everything here is decorative and hidden from assistive technology; the
 * surrounding sections carry the real headings and copy.
 */

export function DottedRoute({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 60" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 46C40 8 74 54 110 30s62-34 106 4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 11"
      />
    </svg>
  );
}

export function ChurchVan({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 27V14a3 3 0 0 1 3-3h26l11 9h9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 27h11M31 27h13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="28" r="4.5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="49" cy="28" r="4.5" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 11v9M35 20h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function LocationPin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PrayingHands({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.4c-2.5 2.7-4.7 6.3-5.3 9-.5 2.3-.2 4.1.7 5.2h4.6z" />
        <path d="M12 3.4c2.5 2.7 4.7 6.3 5.3 9 .5 2.3.2 4.1-.7 5.2h-4.6z" />
        <path d="M7.4 17.6h9.2l-.8 3.2H8.2z" />
      </g>
    </svg>
  );
}

/** A phone-shaped frame. Content is whatever the section wants to show inside. */
export function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[172px] shrink-0 rounded-[2rem] border-[6px] border-navy bg-white p-2 shadow-[0_18px_40px_-18px_rgba(14,34,57,0.55)] sm:w-[210px] lg:w-[248px] ${className}`}
    >
      <div className="overflow-hidden rounded-[1.4rem] bg-cream">
        <div className="flex items-center justify-center bg-navy py-1">
          <span className="h-1 w-12 rounded-full bg-white/30" aria-hidden="true" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** One row of the readiness list inside a mockup. */
export function MockRow({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
}) {
  const valueTone =
    tone === "good" ? "text-green-deep" : tone === "warn" ? "text-coral-deep" : "text-navy";
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line/70 px-3 py-1.5 first:border-t-0">
      <span className="text-[11px] font-semibold text-navy-soft">{label}</span>
      <span className={`text-[11px] font-bold tabular-nums ${valueTone}`}>{value}</span>
    </div>
  );
}
