/**
 * Reading, mapping and validating a church's spreadsheet.
 *
 * Pure logic, so no database: the point of these is that a hostile or simply
 * messy file becomes either clean attendee data or an honest error, and never
 * an executed formula, a crash, or a silently wrong record.
 *
 *   npm test
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  autoMap,
  ageOn,
  neutralizeFormula,
  normalizeHeading,
  parseDate,
  validateRow,
  TEMPLATE_HEADERS,
  type ImportField,
} from "../src/lib/import/mapping";
import { parseDelimited, readSpreadsheet, SpreadsheetError } from "../src/lib/import/spreadsheet";
import { csvTemplate, xlsxTemplate } from "../src/lib/import/template";
import { IMPORT_LIMITS } from "../src/lib/entitlement";

const buf = (text: string) => Buffer.from(text, "utf8");

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

test("reads a plain CSV", () => {
  const sheet = readSpreadsheet(buf("First Name,Last Name\nRuby,Bennett\nMicah,Cole\n"));
  assert.deepEqual(sheet.headers, ["First Name", "Last Name"]);
  assert.deepEqual(sheet.rows, [
    ["Ruby", "Bennett"],
    ["Micah", "Cole"],
  ]);
});

test("handles quotes, escaped quotes, commas and newlines inside cells", () => {
  const rows = parseDelimited('a,"b,c","d""e","line\nbreak"\n');
  assert.deepEqual(rows, [["a", "b,c", 'd"e', "line\nbreak"]]);
});

test("skips a title row above the headers", () => {
  const sheet = readSpreadsheet(buf("Youth Trip Roster\n\nFirst Name,Last Name\nRuby,Bennett\n"));
  assert.deepEqual(sheet.headers, ["First Name", "Last Name"]);
  assert.equal(sheet.rows.length, 1);
});

test("strips a byte order mark rather than gluing it to the first heading", () => {
  const sheet = readSpreadsheet(buf("﻿First Name,Last Name\nRuby,Bennett\n"));
  assert.equal(sheet.headers[0], "First Name");
});

test("reads tab and semicolon separated exports", () => {
  assert.equal(readSpreadsheet(buf("First Name\tLast Name\nRuby\tBennett\n")).headers.length, 2);
  assert.equal(readSpreadsheet(buf("First Name;Last Name\nRuby;Bennett\n")).headers.length, 2);
});

test("drops blank rows churches leave at the bottom of a sheet", () => {
  const sheet = readSpreadsheet(buf("First Name,Last Name\nRuby,Bennett\n,\n\n,\n"));
  assert.equal(sheet.rows.length, 1);
});

test("an empty file is an error a leader can act on", () => {
  assert.throws(() => readSpreadsheet(Buffer.alloc(0)), SpreadsheetError);
  assert.throws(() => readSpreadsheet(buf("\n\n\n")), SpreadsheetError);
});

test("an unclosed quotation mark is reported, not guessed at", () => {
  assert.throws(() => readSpreadsheet(buf('First Name,Last Name\n"Ruby,Bennett\n')), SpreadsheetError);
});

test("a file over the byte limit is refused before it is parsed", () => {
  const huge = Buffer.alloc(IMPORT_LIMITS.maxBytes + 1, 0x61);
  assert.throws(() => readSpreadsheet(huge), /larger than/);
});

test("a file over the row limit is refused with the number in the message", () => {
  const rows = ["First Name,Last Name"];
  for (let i = 0; i < IMPORT_LIMITS.maxRows + 5; i += 1) rows.push(`Person${i},Test`);
  assert.throws(() => readSpreadsheet(buf(rows.join("\n"))), /1000/);
});

test("a legacy .xls is named rather than mis-parsed as text", () => {
  // The OLE2 compound-file signature every .xls and .doc starts with.
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  assert.throws(() => readSpreadsheet(ole), /older \.xls/);
});

test("columns beyond the limit are dropped rather than growing without bound", () => {
  const headers = Array.from({ length: IMPORT_LIMITS.maxColumns + 20 }, (_, i) => `C${i}`);
  const sheet = readSpreadsheet(buf(`${headers.join(",")}\n${headers.map(() => "x").join(",")}\n`));
  assert.equal(sheet.headers.length, IMPORT_LIMITS.maxColumns);
});

test("an enormous cell is truncated rather than stored whole", () => {
  const sheet = readSpreadsheet(
    buf(`First Name,Notes\nRuby,${"x".repeat(IMPORT_LIMITS.maxCellLength + 500)}\n`),
  );
  assert.equal(sheet.rows[0][1].length, IMPORT_LIMITS.maxCellLength);
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/** Builds a minimal workbook so the reader is exercised on real ZIP + XML. */
function workbook(entries: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  const crcTable = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    return table;
  })();
  const crc32 = (b: Buffer) => {
    let crc = -1;
    for (const byte of b) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    return (crc ^ -1) >>> 0;
  };

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.content, "utf8");
    const deflated = deflateRawSync(raw);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    locals.push(local, deflated);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + deflated.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function sheet(rowsXml: string, shared?: string, styles?: string) {
  const entries = [
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
    },
  ];
  if (shared) entries.push({ name: "xl/sharedStrings.xml", content: shared });
  if (styles) entries.push({ name: "xl/styles.xml", content: styles });
  return workbook(entries);
}

test("reads an xlsx using inline strings", () => {
  const rows =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>First Name</t></is></c><c r="B1" t="inlineStr"><is><t>Last Name</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Ruby</t></is></c><c r="B2" t="inlineStr"><is><t>Bennett</t></is></c></row>';
  const parsed = readSpreadsheet(sheet(rows));
  assert.deepEqual(parsed.headers, ["First Name", "Last Name"]);
  assert.deepEqual(parsed.rows, [["Ruby", "Bennett"]]);
});

test("reads an xlsx using the shared string table, including split runs", () => {
  const shared =
    "<sst><si><t>First Name</t></si><si><r><t>Ru</t></r><r><t>by</t></r></si></sst>";
  const rows =
    '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>';
  const parsed = readSpreadsheet(sheet(rows, shared));
  assert.deepEqual(parsed.headers, ["First Name"]);
  assert.deepEqual(parsed.rows, [["Ruby"]]);
});

test("a formula's cached value is read and the formula itself is ignored", () => {
  // What a spreadsheet writes for =CONCAT("Ru","by"): the <f> is the formula
  // and <v> is the value it last computed. Nothing here evaluates <f>.
  const rows =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>First Name</t></is></c></row>' +
    '<row r="2"><c r="A2" t="str"><f>CONCAT("Ru","by")</f><v>Ruby</v></c></row>';
  const parsed = readSpreadsheet(sheet(rows));
  assert.deepEqual(parsed.rows, [["Ruby"]]);
  assert.ok(!JSON.stringify(parsed).includes("CONCAT"), "the formula text never reaches the data");
});

test("a macro-bearing workbook imports its cells and never touches the macro", () => {
  const rows = '<row r="1"><c r="A1" t="inlineStr"><is><t>First Name</t></is></c></row>';
  const withMacro = workbook([
    { name: "xl/worksheets/sheet1.xml", content: `<worksheet><sheetData>${rows}</sheetData></worksheet>` },
    { name: "xl/vbaProject.bin", content: "Sub AutoOpen()\nShell(\"rm -rf /\")\nEnd Sub" },
  ]);
  const parsed = readSpreadsheet(withMacro);
  assert.deepEqual(parsed.headers, ["First Name"]);
  assert.ok(!JSON.stringify(parsed).includes("AutoOpen"), "the macro is never read");
});

test("an xml entity is decoded but a doctype is never resolved", () => {
  const rows =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Notes</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Tom &amp; Jerry &lt;3</t></is></c></row>';
  const parsed = readSpreadsheet(sheet(rows));
  assert.deepEqual(parsed.rows, [["Tom & Jerry <3"]]);

  // A classic entity-expansion attempt: the entity is unknown, so it is left as
  // text rather than looked up anywhere.
  const evil = sheet(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>&xxe;</t></is></c></row>',
  );
  assert.equal(readSpreadsheet(evil).headers[0], "&xxe;");
});

test("a date-formatted number comes back as a date, not a serial", () => {
  const styles =
    '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>';
  const rows =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Date of Birth</t></is></c></row>' +
    '<row r="2"><c r="A2" s="1"><v>40179</v></c></row>';
  const parsed = readSpreadsheet(sheet(rows, undefined, styles));
  assert.equal(parsed.rows[0][0], "2010-01-01");
});

test("a truncated or non-zip file is an error, not a crash", () => {
  assert.throws(() => readSpreadsheet(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), SpreadsheetError);
  const good = xlsxTemplate();
  assert.throws(() => readSpreadsheet(good.subarray(0, 40)), SpreadsheetError);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test("the CSV template round-trips through our own reader, fully auto-mapped", () => {
  const parsed = readSpreadsheet(buf(csvTemplate()));
  assert.deepEqual(parsed.headers, TEMPLATE_HEADERS);
  assert.equal(parsed.rows.length, 2, "two sample rows");
  assert.deepEqual(autoMap(parsed.headers).filter((f) => f === null), []);
});

test("the Excel template round-trips too, and matches the CSV headers", () => {
  const parsed = readSpreadsheet(xlsxTemplate());
  assert.deepEqual(parsed.headers, TEMPLATE_HEADERS);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(autoMap(parsed.headers).filter((f) => f === null), []);
});

test("the templates contain only obviously invented people", () => {
  const text = csvTemplate();
  assert.match(text, /Ethan/);
  assert.match(text, /Olivia/);
  assert.match(text, /example\.com/, "sample emails use the reserved example domain");
  assert.match(text, /555-01/, "sample phones use the range reserved for fiction");
});

test("the CSV template never writes a live formula", () => {
  for (const line of csvTemplate().split("\r\n")) {
    for (const cell of line.split(",")) {
      assert.ok(!/^"?[=+@]/.test(cell), `cell would be a formula: ${cell}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

test("recognises the column names churches actually use", () => {
  const headers = [
    "FName",
    "Surname",
    "Nickname",
    "DOB",
    "Participant Type",
    "Cell Phone",
    "Email Address",
    "Parent / Guardian",
    "Guardian Email",
    "Emergency Contact",
    "Emergency Phone",
    "Allergies",
    "Medical Notes",
    "Dietary Needs",
    "Shirt Size",
  ];
  assert.deepEqual(autoMap(headers), [
    "firstName",
    "lastName",
    "preferredName",
    "dateOfBirth",
    "participantType",
    "phone",
    "email",
    "guardianName",
    "guardianEmail",
    "emergencyContactName",
    "emergencyContactPhone",
    "allergies",
    "medicalConditions",
    "dietaryRestrictions",
    "shirtSize",
  ]);
});

test("normalises punctuation and case before comparing headings", () => {
  assert.equal(normalizeHeading("Parent/Guardian  Name!"), "parent guardian name");
  assert.deepEqual(autoMap(["  first_name  "]), ["firstName"]);
});

test("an unrecognised column is left for the leader rather than guessed", () => {
  assert.deepEqual(autoMap(["Bus Group", "Cabin Preference"]), [null, null]);
});

test("two columns never map to the same field", () => {
  const mapped = autoMap(["First Name", "First", "Last Name"]);
  assert.deepEqual(mapped, ["firstName", null, "lastName"]);
});

// ---------------------------------------------------------------------------
// Dates and ages
// ---------------------------------------------------------------------------

test("accepts the date formats a church types", () => {
  assert.equal(parseDate("2011-04-18").date?.toISOString().slice(0, 10), "2011-04-18");
  assert.equal(parseDate("4/18/2011").date?.toISOString().slice(0, 10), "2011-04-18");
  assert.equal(parseDate("04/18/11").date?.toISOString().slice(0, 10), "2011-04-18");
  assert.equal(parseDate("").date, null);
  assert.equal(parseDate("").invalid, false);
});

test("rejects an impossible or future date instead of storing nonsense", () => {
  assert.equal(parseDate("2011-02-30").invalid, true);
  assert.equal(parseDate("13/45/2011").invalid, true);
  assert.equal(parseDate("banana").invalid, true);
  assert.equal(parseDate("2099-01-01").invalid, true);
});

test("age is calculated on the day, not by subtracting years", () => {
  const on = new Date(Date.UTC(2026, 3, 17));
  assert.equal(ageOn(new Date(Date.UTC(2008, 3, 18)), on), 17, "birthday tomorrow");
  assert.equal(ageOn(new Date(Date.UTC(2008, 3, 17)), on), 18, "birthday today");
});

// ---------------------------------------------------------------------------
// Formula safety on the way in
// ---------------------------------------------------------------------------

test("a cell that would be a formula is kept as text", () => {
  assert.equal(neutralizeFormula('=HYPERLINK("http://evil","click")'), 'HYPERLINK("http://evil","click")');
  assert.equal(neutralizeFormula("+1-555-0100"), "1-555-0100");
  assert.equal(neutralizeFormula("@SUM(A1:A9)"), "SUM(A1:A9)");
  assert.equal(neutralizeFormula("--fишy"), "fишy");
  // A negative number is a number, not an injection.
  assert.equal(neutralizeFormula("-25"), "-25");
});

test("an injected formula in a name never survives as a formula", () => {
  const row = validateRow(
    2,
    ['=cmd|" /C calc"!A0', "Bennett"],
    ["firstName", "lastName"],
    [],
    [],
  );
  assert.ok(!row.attendee.firstName.startsWith("="));
  assert.equal(row.attendee.firstName, 'cmd|" /C calc"!A0');
});

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

const NAMES: Array<ImportField | null> = ["firstName", "lastName"];

test("a row with both names is ready", () => {
  const row = validateRow(2, ["Ruby", "Bennett"], NAMES, [], []);
  assert.equal(row.status, "WARNING", "no date of birth is a warning, not a blocker");
  assert.equal(row.attendee.firstName, "Ruby");
});

test("a missing name is an error and never imports", () => {
  assert.equal(validateRow(2, ["", "Bennett"], NAMES, [], []).status, "ERROR");
  assert.equal(validateRow(2, ["Ruby", ""], NAMES, [], []).status, "ERROR");
});

test("optional fields left blank do not fail the row", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "phone", "email", "allergies"];
  const row = validateRow(2, ["Ruby", "Bennett", "", "", ""], mapping, [], []);
  assert.notEqual(row.status, "ERROR");
});

test("an ignored column is not imported", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", null];
  const row = validateRow(2, ["Ruby", "Bennett", "Bus 2"], mapping, [], []);
  assert.ok(!JSON.stringify(row.values).includes("Bus 2"));
});

test("a bad email is an error rather than a broken record", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "email"];
  assert.equal(validateRow(2, ["Ruby", "Bennett", "not-an-email"], mapping, [], []).status, "ERROR");
  assert.notEqual(validateRow(2, ["Ruby", "Bennett", "ruby@example.com"], mapping, [], []).status, "ERROR");
});

test("an invalid date of birth is an error", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "dateOfBirth"];
  const row = validateRow(2, ["Micah", "Cole", "31/31/2011"], mapping, [], []);
  assert.equal(row.status, "ERROR");
  assert.ok(row.messages.some((m) => /date of birth/i.test(m)));
});

test("minor status is derived from a date of birth when it is the only clue", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "dateOfBirth"];
  const minor = validateRow(2, ["Ruby", "Bennett", "2012-05-05"], mapping, [], []);
  assert.equal(minor.attendee.isMinor, true);
  const adult = validateRow(3, ["Dana", "Reyes", "1985-05-05"], mapping, [], []);
  assert.equal(adult.attendee.isMinor, false);
});

test("a stated adult/minor is used when there is no date of birth", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "participantType"];
  assert.equal(validateRow(2, ["Ruby", "B", "Minor"], mapping, [], []).attendee.isMinor, true);
  assert.equal(validateRow(2, ["Dana", "R", "Adult"], mapping, [], []).attendee.isMinor, false);
  const leader = validateRow(2, ["Tom", "A", "Chaperone"], mapping, [], []);
  assert.equal(leader.attendee.isLeader, true);
  assert.equal(leader.attendee.isMinor, false);
});

test("a date of birth that contradicts adult/minor is flagged, never corrected", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "dateOfBirth", "participantType"];
  const row = validateRow(2, ["Ruby", "Bennett", "2006-01-01", "Minor"], mapping, [], []);
  assert.equal(row.status, "ERROR");
  assert.ok(row.messages.some((m) => /conflicts with Date of Birth/i.test(m)));
});

test("neither date of birth nor adult/minor is a warning to come back to", () => {
  const row = validateRow(2, ["Ruby", "Bennett"], NAMES, [], []);
  assert.equal(row.status, "WARNING");
  assert.ok(row.messages.some((m) => /adult\/minor/i.test(m)));
});

test("a minor with a guardian name but no email warns without blocking", () => {
  const mapping: Array<ImportField | null> = [
    "firstName",
    "lastName",
    "dateOfBirth",
    "guardianName",
  ];
  const row = validateRow(2, ["Ruby", "Bennett", "2012-01-01", "Dana Bennett"], mapping, [], []);
  assert.equal(row.status, "WARNING");
  assert.ok(row.messages.some((m) => /guardian email/i.test(m)));
});

test("an unrecognised payment status is an error rather than a silent UNPAID", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "paymentStatus"];
  assert.equal(validateRow(2, ["Ruby", "B", "sort of"], mapping, [], []).status, "ERROR");
  assert.equal(
    validateRow(2, ["Ruby", "B", "Scholarship"], mapping, [], []).attendee.paymentStatus,
    "SCHOLARSHIP",
  );
});

test("money is read with currency symbols and rejected when it is not a number", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "amountPaid"];
  assert.equal(validateRow(2, ["Ruby", "B", "$1,250.50"], mapping, [], []).attendee.amountPaid, 1250.5);
  assert.equal(validateRow(2, ["Ruby", "B", "about fifty"], mapping, [], []).status, "ERROR");
});

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

test("someone already on the trip is flagged as a possible duplicate", () => {
  const existing = [{ firstName: "Ruby", lastName: "Bennett", dateOfBirth: null }];
  const row = validateRow(2, ["ruby", "BENNETT"], NAMES, existing, []);
  assert.equal(row.status, "DUPLICATE");
});

test("two people with the same name and different birthdays are not duplicates", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "dateOfBirth"];
  const existing = [
    { firstName: "Ruby", lastName: "Bennett", dateOfBirth: new Date(Date.UTC(2010, 0, 1)) },
  ];
  const row = validateRow(2, ["Ruby", "Bennett", "2012-06-06"], mapping, existing, []);
  assert.notEqual(row.status, "DUPLICATE");
});

test("the same name and the same birthday is a strong duplicate", () => {
  const mapping: Array<ImportField | null> = ["firstName", "lastName", "dateOfBirth"];
  const existing = [
    { firstName: "Ruby", lastName: "Bennett", dateOfBirth: new Date(Date.UTC(2012, 5, 6)) },
  ];
  const row = validateRow(2, ["Ruby", "Bennett", "2012-06-06"], mapping, existing, []);
  assert.equal(row.status, "DUPLICATE");
  assert.ok(row.messages.some((m) => /same date of birth/i.test(m)));
});

test("a name repeated inside the same file is flagged too", () => {
  const seen = [{ firstName: "Ruby", lastName: "Bennett", dateOfBirth: null }];
  assert.equal(validateRow(3, ["Ruby", "Bennett"], NAMES, [], seen).status, "DUPLICATE");
});
