import { CheckBadge } from "@/components/brand";
import { MockRow, PhoneFrame } from "@/components/marketing/art";

/** A full-bleed band. Sections alternate cream and white down the page. */
export function Band({
  id,
  tone = "cream",
  className = "",
  children,
}: {
  id?: string;
  tone?: "cream" | "white" | "green";
  className?: string;
  children: React.ReactNode;
}) {
  const background = {
    cream: "bg-cream text-navy",
    white: "bg-white text-navy",
    green: "bg-green-brand text-white",
  }[tone];
  return (
    <section id={id} className={`scroll-mt-16 ${background} ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "cream" }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.14em] ${
        tone === "green" ? "text-green-deep" : "text-cream-deep"
      }`}
    >
      {children}
    </p>
  );
}

export function Display({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Tag
      // break-words: at 200% text a word like SPREADSHEETS is wider than a
      // phone, and an uppercase display face gives the browser no break points.
      className={`font-display text-3xl font-extrabold uppercase leading-[1.05] tracking-tight break-words hyphens-auto sm:text-4xl lg:text-5xl ${className}`}
    >
      {children}
    </Tag>
  );
}

export function FeatureCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_2px_0_rgba(14,34,57,0.04)]">
      <div className="text-green-brand" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-3 font-display text-base font-extrabold uppercase tracking-tight text-navy">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-navy-soft">{body}</p>
    </div>
  );
}

/** Native disclosure — an accordion that works with no JavaScript at all. */
export function FaqItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  return (
    <details className="group border-b border-line py-1">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-navy [&::-webkit-details-marker]:hidden">
        {question}
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream-deep text-navy transition group-open:rotate-45"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div className="pb-4 pr-10 text-sm leading-relaxed text-navy-soft">{answer}</div>
    </details>
  );
}

/** The readiness phone from the hero, matching what the real dashboard shows. */
export function ReadinessPhone() {
  return (
    <PhoneFrame>
      <div className="bg-green-brand px-3 py-2.5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/75">
          Ohio Youth Convention 2026
        </p>
        <p className="font-display text-2xl font-extrabold leading-none">87% Ready</p>
      </div>
      <div className="py-1">
        <MockRow label="People" value="46 / 50" />
        <MockRow label="Waivers" value="42 / 50" tone="warn" />
        <MockRow label="Forms" value="44 / 50" />
        <MockRow label="Payments" value="$4,625 / $5,200" />
        <MockRow label="Transportation" value="6 / 6" tone="good" />
        <MockRow label="Lodging" value="14 / 14" tone="good" />
        <MockRow label="Prayer" value="Not complete" />
      </div>
      <div className="border-t border-line bg-cream-deep/60 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-navy-soft">Outstanding</p>
        <ul className="mt-1 space-y-0.5 text-[11px] font-semibold text-navy">
          <li>4 unsigned waivers</li>
          <li>1 person needs a vehicle</li>
          <li>$375 outstanding</li>
        </ul>
      </div>
    </PhoneFrame>
  );
}

/** The headcount phone. */
export function HeadcountPhone({
  present = 45,
  total = 50,
  missing = ["Ruby Bennett", "Micah Cole"],
  here = ["Ava Callahan", "Levi Bergstrom", "Sadie Brookshire"],
}: {
  present?: number;
  total?: number;
  missing?: string[];
  here?: string[];
}) {
  return (
    <PhoneFrame>
      <div className="bg-navy px-3 py-2.5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Headcount</p>
        <p className="font-display text-2xl font-extrabold leading-none">
          {present} / {total}
        </p>
        <p className="text-[11px] font-semibold text-white/80">Accounted for</p>
      </div>
      <div className="px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-coral-deep">
          {total - present} still missing
        </p>
        <ul className="mt-1.5 space-y-1">
          {missing.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-lg bg-coral-soft px-2 py-1.5 text-[11px] font-semibold text-navy"
            >
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-coral" aria-hidden="true" />
              {name}
            </li>
          ))}
          {here.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-lg bg-green-soft px-2 py-1.5 text-[11px] font-semibold text-navy"
            >
              <CheckBadge className="h-4 w-4 shrink-0 bg-transparent text-green-brand" />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </PhoneFrame>
  );
}
