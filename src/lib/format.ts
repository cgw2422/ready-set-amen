export function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Dates are stored at UTC midnight; format them in UTC so they never shift. */
export function formatDate(date: Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "Dates not set";
  if (start && !end) return formatDate(start);
  if (!start && end) return `Through ${formatDate(end)}`;
  const s = start!;
  const e = end!;
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonth) {
    return `${formatDate(s, { year: undefined })} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${formatDate(s, sameYear ? { year: undefined } : {})} – ${formatDate(e)}`;
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "14:30" -> "2:30 PM". Itinerary times are wall-clock strings, not instants. */
export function formatClock(time: string | null | undefined): string {
  if (!time) return "";
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function displayName(a: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}): string {
  return `${a.preferredName?.trim() || a.firstName} ${a.lastName}`.trim();
}

export function fullLegalName(a: { firstName: string; lastName: string }): string {
  return `${a.firstName} ${a.lastName}`.trim();
}

export function ageOn(dob: Date | null | undefined, on: Date = new Date()): number | null {
  if (!dob) return null;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export function initials(a: { firstName: string; lastName: string }): string {
  return `${a.firstName.charAt(0)}${a.lastName.charAt(0)}`.toUpperCase();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "2026-06-14" from a form input -> a UTC-midnight Date, no timezone drift. */
export function parseDateInput(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Flags a roster entry whose minor/adult flag contradicts its date of birth.
 *
 * This matters beyond tidiness: the flag decides whether the participant signs
 * their own waiver or a guardian signs for them. A 19-year-old marked as a
 * minor means the wrong person is being asked to sign.
 */
export function minorFlagMismatch(attendee: {
  isMinor: boolean;
  dateOfBirth: Date | null;
}): { age: number; expected: "adult" | "minor" } | null {
  const age = ageOn(attendee.dateOfBirth);
  if (age === null) return null;
  if (attendee.isMinor && age >= 18) return { age, expected: "adult" };
  if (!attendee.isMinor && age < 18) return { age, expected: "minor" };
  return null;
}
