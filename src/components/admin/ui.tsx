import Link from "next/link";
import type { Entitlement } from "@prisma/client";

/**
 * Admin chrome: bigger numbers, denser tables, fewer flourishes than the
 * consumer app, but the same brand tokens. Numbers first — there are no charts
 * here and no charting dependency.
 */

export function Kpi({
  label,
  value,
  trend,
  emphasis = false,
}: {
  label: string;
  value: string;
  trend?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-4 ${
        emphasis ? "border-green-brand/30 bg-green-tint" : "border-line bg-white"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-navy-soft">{label}</p>
      <p
        className={`mt-1 font-display font-extrabold leading-none text-navy ${
          emphasis ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {value}
      </p>
      {trend ? <p className="mt-1.5 text-xs font-semibold text-green-deep">{trend}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-extrabold uppercase tracking-tight text-navy">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-navy-soft">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Tables scroll inside themselves so a narrow phone never scrolls the page. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
  href,
  active = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  href?: string;
  active?: boolean;
}) {
  const content = href ? (
    <Link href={href} className={`hover:underline ${active ? "text-green-deep" : ""}`}>
      {children}
      {active ? " ↓" : ""}
    </Link>
  ) : (
    children
  );
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-wide text-navy-soft ${
        numeric ? "text-right" : "text-left"
      }`}
    >
      {content}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  muted = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`border-b border-line/70 px-3 py-2.5 align-top ${
        numeric ? "text-right tabular-nums" : ""
      } ${muted ? "text-navy-faint" : "text-navy"}`}
    >
      {children}
    </td>
  );
}

const ENTITLEMENT_TONE: Record<Entitlement, string> = {
  LIFETIME: "bg-green-soft text-green-deep",
  MANUAL_LIFETIME: "bg-gold-soft text-gold-deep",
  DEMO: "bg-cream-deep text-navy-soft",
  FREE_SETUP: "bg-coral-soft text-coral-deep",
};

const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  LIFETIME: "Lifetime",
  MANUAL_LIFETIME: "Manual",
  DEMO: "Demo",
  FREE_SETUP: "Free setup",
};

export function EntitlementTag({ entitlement }: { entitlement: Entitlement }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${ENTITLEMENT_TONE[entitlement]}`}
    >
      {ENTITLEMENT_LABEL[entitlement]}
    </span>
  );
}

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
