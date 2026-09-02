import { formatDateRange } from "@/lib/format";

export function PrintHeader({
  title,
  tripName,
  organizationName,
  destination,
  startDate,
  endDate,
}: {
  title: string;
  tripName: string;
  organizationName: string;
  destination?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  return (
    <header className="border-b-4 border-green-brand pb-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-green-brand">
            Ready. Set. Amen.
          </p>
          <h1 className="font-display text-2xl font-extrabold text-navy">{title}</h1>
          <p className="text-sm text-navy-soft">
            {tripName} · {organizationName}
          </p>
        </div>
        <div className="text-right text-sm text-navy-soft">
          {destination ? <p>{destination}</p> : null}
          <p>{formatDateRange(startDate ?? null, endDate ?? null)}</p>
        </div>
      </div>
    </header>
  );
}
