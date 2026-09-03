/**
 * Turning somebody else's spreadsheet into attendees.
 *
 * Two jobs live here and nothing else: guessing which column is which, and
 * deciding whether a row is safe to import. Both are pure functions over
 * strings so the preview a leader approves and the rows the server writes are
 * produced by exactly the same code.
 *
 * The guessing is deliberately conservative. A column is auto-mapped only when
 * its heading matches a known name outright; anything else is left for the
 * leader to set, because silently importing a phone number into the notes field
 * is worse than asking.
 */

export const IMPORT_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "preferredName", label: "Preferred Name" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "participantType", label: "Adult / Minor" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "guardianName", label: "Parent / Guardian Name" },
  { key: "guardianEmail", label: "Parent / Guardian Email" },
  { key: "guardianPhone", label: "Parent / Guardian Phone" },
  { key: "emergencyContactName", label: "Emergency Contact Name" },
  { key: "emergencyContactPhone", label: "Emergency Contact Phone" },
  { key: "allergies", label: "Allergies" },
  { key: "medicalConditions", label: "Medical Conditions" },
  { key: "medications", label: "Medications" },
  { key: "dietaryRestrictions", label: "Dietary Restrictions" },
  { key: "shirtSize", label: "Shirt Size" },
  { key: "notes", label: "Notes" },
  { key: "paymentStatus", label: "Payment Status" },
  { key: "amountPaid", label: "Amount Paid" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

/** The column order used by the downloadable templates. */
export const TEMPLATE_HEADERS = IMPORT_FIELDS.map((f) => f.label);

export function isImportField(value: unknown): value is ImportField {
  return typeof value === "string" && IMPORT_FIELDS.some((f) => f.key === value);
}

/** Headings recognised without asking. Compared after normalising punctuation. */
const ALIASES: Record<ImportField, string[]> = {
  firstName: ["first name", "first", "fname", "given name", "firstname", "given"],
  lastName: ["last name", "last", "lname", "surname", "lastname", "family name"],
  preferredName: ["preferred name", "nickname", "goes by", "preferred", "nick name"],
  gender: ["gender", "sex", "m f", "male female"],
  dateOfBirth: ["date of birth", "dob", "birth date", "birthday", "birthdate", "born"],
  participantType: [
    "adult minor",
    "minor",
    "adult",
    "participant type",
    "type",
    "student adult",
    "role",
    "student or adult",
  ],
  phone: ["phone", "mobile", "cell", "cell phone", "phone number", "mobile phone", "student phone"],
  email: ["email", "email address", "e mail", "student email"],
  guardianName: [
    "parent name",
    "guardian name",
    "parent guardian",
    "parent guardian name",
    "parent",
    "guardian",
    "mother father",
  ],
  guardianEmail: [
    "parent email",
    "guardian email",
    "parent guardian email",
    "parent email address",
  ],
  guardianPhone: [
    "parent phone",
    "guardian phone",
    "parent guardian phone",
    "parent cell",
    "guardian cell",
  ],
  emergencyContactName: [
    "emergency contact",
    "emergency contact name",
    "emergency name",
    "emergency",
  ],
  emergencyContactPhone: [
    "emergency phone",
    "emergency contact phone",
    "emergency number",
    "emergency contact number",
  ],
  allergies: ["allergies", "allergy", "allergic to"],
  medicalConditions: [
    "medical conditions",
    "medical notes",
    "medical",
    "conditions",
    "medical condition",
    "health conditions",
  ],
  medications: ["medications", "medication", "meds", "prescriptions"],
  dietaryRestrictions: [
    "dietary restrictions",
    "dietary needs",
    "dietary",
    "diet",
    "food restrictions",
    "food allergies",
  ],
  shirtSize: ["shirt size", "t shirt size", "tshirt size", "shirt", "tee size"],
  notes: ["notes", "note", "comments", "other"],
  paymentStatus: ["payment status", "paid status", "payment"],
  amountPaid: ["amount paid", "paid", "amount", "payment amount", "deposit paid"],
};

/** Lowercase, strip punctuation, collapse spaces: "Parent/Guardian" -> "parent guardian". */
export function normalizeHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, ImportField>();
for (const [field, aliases] of Object.entries(ALIASES) as [ImportField, string[]][]) {
  for (const alias of aliases) if (!LOOKUP.has(alias)) LOOKUP.set(alias, field);
}

/** True when a cell is a column name Ready Set Amen recognises. */
export function looksLikeHeading(cell: string): boolean {
  return LOOKUP.has(normalizeHeading(cell));
}

/**
 * Which row is the header.
 *
 * Churches send spreadsheets with a title line, a blank row, sometimes both,
 * above the real headings. The row that scores the most recognised column names
 * wins; failing that, the first row with more than one filled cell, because a
 * title usually sits alone in column A.
 */
export function detectHeaderRow(table: string[][]): number {
  const candidates = table
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => cell.trim().length > 0))
    .slice(0, 10);
  if (candidates.length === 0) return -1;

  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = candidate.row.filter((cell) => looksLikeHeading(cell)).length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (bestScore > 0) return best.index;

  const multiCell = candidates.find(
    ({ row }) => row.filter((cell) => cell.trim().length > 0).length > 1,
  );
  return (multiCell ?? candidates[0]).index;
}

/**
 * One entry per source column: the field it will import into, or null for
 * "ignore this column". Duplicates are dropped rather than guessed at — two
 * columns cannot both be First Name.
 */
export function autoMap(headers: string[]): Array<ImportField | null> {
  const taken = new Set<ImportField>();
  return headers.map((heading) => {
    const field = LOOKUP.get(normalizeHeading(heading));
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export type RowStatus = "READY" | "WARNING" | "ERROR" | "DUPLICATE";

export type ParsedRow = {
  /** 1-based row number in the uploaded file, for messages a leader can act on. */
  line: number;
  status: RowStatus;
  messages: string[];
  values: Partial<Record<ImportField, string>>;
  attendee: AttendeeDraft;
};

export type AttendeeDraft = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  isMinor: boolean;
  isLeader: boolean;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
  dietaryRestrictions: string | null;
  shirtSize: string | null;
  notes: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "SCHOLARSHIP" | "WAIVED" | null;
  amountPaid: number | null;
};

/** Existing people on the trip, for duplicate detection. */
export type ExistingAttendee = { firstName: string; lastName: string; dateOfBirth: Date | null };

const MINOR_AGE = 18;

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A cell beginning with =, +, - or @ is what a spreadsheet treats as a formula.
 * Nothing here evaluates it, but a leading apostrophe or the raw text would
 * become a live formula again the moment someone exports the data, so the
 * marker is dropped on the way in and the value is kept as text.
 */
export function neutralizeFormula(value: string): string {
  return value.replace(/^[\s]*[=+@]+/, "").replace(/^[\s]*-{2,}/, "");
}

/** Accepts the date formats churches actually type, and nothing ambiguous. */
export function parseDate(value: string): { date: Date | null; invalid: boolean } {
  const text = value.trim();
  if (!text) return { date: null, invalid: false };

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashed = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/);

  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (slashed) {
    // US order, which is what a church in Ohio types and what Excel exports there.
    month = Number(slashed[1]);
    day = Number(slashed[2]);
    year = Number(slashed[3]);
    if (year < 100) year += year > 30 ? 1900 : 2000;
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return { date: null, invalid: true };
    return { date: new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())), invalid: false };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return { date: null, invalid: true };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { date: null, invalid: true };
  }
  if (year < 1900 || date.getTime() > Date.now()) return { date: null, invalid: true };
  return { date, invalid: false };
}

export function ageOn(dateOfBirth: Date, on = new Date()): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
}

/** "Minor", "Student", "Youth", "Adult", "Leader", "Chaperone", "A"/"M". */
function readParticipantType(value: string): { isMinor: boolean; isLeader: boolean } | null {
  const text = normalizeHeading(value);
  if (!text) return null;
  if (/^(minor|student|youth|child|kid|m|teen)$/.test(text)) return { isMinor: true, isLeader: false };
  if (/^(adult|a|parent|sponsor)$/.test(text)) return { isMinor: false, isLeader: false };
  if (/^(leader|chaperone|staff|volunteer|driver)$/.test(text)) {
    return { isMinor: false, isLeader: true };
  }
  return null;
}

function readPaymentStatus(value: string): AttendeeDraft["paymentStatus"] | undefined {
  const text = normalizeHeading(value);
  if (!text) return null;
  if (/^(paid|paid in full|complete|full)$/.test(text)) return "PAID";
  if (/^(partial|partially paid|deposit|deposit paid)$/.test(text)) return "PARTIAL";
  if (/^(unpaid|none|not paid|owes|outstanding)$/.test(text)) return "UNPAID";
  if (/^(scholarship|sponsored|scholarshipped)$/.test(text)) return "SCHOLARSHIP";
  if (/^(waived|waiver|comp|free)$/.test(text)) return "WAIVED";
  return undefined;
}

function readMoney(value: string): number | null | undefined {
  const text = value.replace(/[$,\s]/g, "");
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return undefined;
  return Math.round(amount * 100) / 100;
}

/** A conservative shape check — the goal is catching typos, not policing addresses. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

/**
 * Validates one spreadsheet row against the chosen mapping.
 *
 * ERROR rows never import: the required fields are missing, or a value would
 * silently become wrong data. WARNING rows import fine and simply need
 * attention later, which is what Trip Readiness is already for.
 */
export function validateRow(
  line: number,
  cells: string[],
  mapping: Array<ImportField | null>,
  existing: ExistingAttendee[],
  seen: ExistingAttendee[],
): ParsedRow {
  const values: Partial<Record<ImportField, string>> = {};
  mapping.forEach((field, index) => {
    if (!field) return;
    const raw = cells[index] ?? "";
    const cleaned = neutralizeFormula(raw).trim();
    if (cleaned) values[field] = cleaned;
  });

  // Collected rather than folded into a status as we go, so the final status is
  // decided once, at the end, from everything that was found.
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (message: string) => errors.push(message);
  const warn = (message: string) => warnings.push(message);

  const firstName = blank(values.firstName);
  const lastName = blank(values.lastName);
  if (!firstName) fail("Missing first name");
  if (!lastName) fail("Missing last name");

  // --- age and participant type -------------------------------------------
  const dob = parseDate(values.dateOfBirth ?? "");
  if (dob.invalid) fail("Invalid date of birth");

  const stated = readParticipantType(values.participantType ?? "");
  let isMinor = false;
  let isLeader = stated?.isLeader ?? false;

  if (dob.date && stated) {
    const derived = ageOn(dob.date) < MINOR_AGE;
    if (derived !== stated.isMinor) {
      // Never quietly pick a side: one of the two is wrong and only the church knows which.
      fail("Adult / Minor conflicts with Date of Birth");
    }
    isMinor = derived;
  } else if (dob.date) {
    isMinor = ageOn(dob.date) < MINOR_AGE;
  } else if (stated) {
    isMinor = stated.isMinor;
  } else {
    warn("No date of birth or adult/minor — set it after importing");
  }

  // --- contact details ----------------------------------------------------
  const email = blank(values.email);
  if (email && !looksLikeEmail(email)) fail("Invalid email address");

  const guardianEmail = blank(values.guardianEmail);
  if (guardianEmail && !looksLikeEmail(guardianEmail)) fail("Invalid parent / guardian email");

  const guardianName = blank(values.guardianName);
  if (isMinor && !guardianName && !guardianEmail && !blank(values.guardianPhone)) {
    warn("Minor with no parent or guardian");
  } else if (isMinor && guardianName && !guardianEmail) {
    warn("Missing guardian email");
  }

  if (!blank(values.emergencyContactName) || !blank(values.emergencyContactPhone)) {
    if (!blank(values.emergencyContactName)) warn("Missing emergency contact phone");
    else if (!blank(values.emergencyContactPhone)) warn("Missing emergency contact name");
  }

  // --- payments -----------------------------------------------------------
  const paymentStatus = readPaymentStatus(values.paymentStatus ?? "");
  if (paymentStatus === undefined) fail(`Unrecognised payment status "${values.paymentStatus}"`);

  const amountPaid = readMoney(values.amountPaid ?? "");
  if (amountPaid === undefined) fail(`Unrecognised amount paid "${values.amountPaid}"`);

  const attendee: AttendeeDraft = {
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    preferredName: blank(values.preferredName),
    gender: blank(values.gender),
    dateOfBirth: dob.date,
    isMinor,
    isLeader,
    phone: blank(values.phone),
    email,
    guardianName,
    guardianEmail,
    guardianPhone: blank(values.guardianPhone),
    emergencyContactName: blank(values.emergencyContactName),
    emergencyContactPhone: blank(values.emergencyContactPhone),
    allergies: blank(values.allergies),
    medicalConditions: blank(values.medicalConditions),
    medications: blank(values.medications),
    dietaryRestrictions: blank(values.dietaryRestrictions),
    shirtSize: blank(values.shirtSize),
    notes: blank(values.notes),
    paymentStatus: paymentStatus ?? null,
    amountPaid: amountPaid ?? null,
  };

  // --- duplicates ---------------------------------------------------------
  // Two people genuinely can share a name, so a match is a question, never a
  // decision. Same name and same birthday is treated as strong; same name alone
  // is flagged but importable.
  const duplicate =
    errors.length === 0 && firstName && lastName
      ? [...existing, ...seen].find(
          (other) =>
            sameName(other, attendee) &&
            (bothDated(other, attendee) ? sameDay(other.dateOfBirth, attendee.dateOfBirth) : true),
        )
      : undefined;

  if (duplicate) {
    warnings.push(
      bothDated(duplicate, attendee)
        ? "Already on this trip with the same date of birth"
        : "Someone with this name is already on this trip",
    );
  }

  const status: RowStatus =
    errors.length > 0 ? "ERROR" : duplicate ? "DUPLICATE" : warnings.length > 0 ? "WARNING" : "READY";

  return { line, status, messages: [...errors, ...warnings], values, attendee };
}

function sameName(a: { firstName: string; lastName: string }, b: AttendeeDraft): boolean {
  return (
    a.firstName.trim().toLowerCase() === b.firstName.trim().toLowerCase() &&
    a.lastName.trim().toLowerCase() === b.lastName.trim().toLowerCase()
  );
}

function bothDated(a: { dateOfBirth: Date | null }, b: AttendeeDraft): boolean {
  return Boolean(a.dateOfBirth && b.dateOfBirth);
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return Boolean(a && b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10));
}
