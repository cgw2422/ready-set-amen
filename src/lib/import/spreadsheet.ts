import "server-only";
import { inflateRawSync } from "node:zlib";
import { IMPORT_LIMITS } from "@/lib/entitlement";
import { detectHeaderRow } from "@/lib/import/mapping";

/**
 * Reading a church's spreadsheet, safely.
 *
 * An uploaded file is untrusted input from a person who may have been sent it
 * by someone else. This reader is deliberately first-party and deliberately
 * incapable of doing anything but read text out of cells:
 *
 *   - It never evaluates a formula. For XLSX it reads the cached `<v>` value a
 *     spreadsheet program stored and ignores the `<f>` formula element
 *     entirely; there is no expression evaluator in this file to exploit.
 *   - It never runs a macro. Macros live in `xl/vbaProject.bin`, which is not
 *     one of the entries this reader decompresses, so a .xlsm renamed to .xlsx
 *     is inert rather than dangerous.
 *   - It never renders anything. Values come back as plain strings and are
 *     escaped by React like any other text.
 *   - It has no network or filesystem access, follows no external references
 *     and resolves no entities, so a workbook pointing at a remote sheet or a
 *     CSV full of `=IMPORTDATA(...)` yields inert text.
 *
 * Everything is bounded before it is parsed — bytes, rows, columns, cell
 * length — so a malformed or hostile file fails as a message to the leader
 * rather than as memory pressure on the server.
 */

export type Sheet = { headers: string[]; rows: string[][] };

export class SpreadsheetError extends Error {}

const MAX_CELL = IMPORT_LIMITS.maxCellLength;

/** ZIP local file header, i.e. the first bytes of any .xlsx. */
const ZIP_MAGIC = 0x04034b50;
/** OLE2 compound file, i.e. a legacy .xls or a .doc. */
const OLE_MAGIC = 0xe011cfd0;
const ZIP_CENTRAL_DIRECTORY = 0x02014b50;
const ZIP_END_OF_DIRECTORY = 0x06054b50;

function trimCell(value: string): string {
  const collapsed = value.replace(/\r\n?/g, "\n").trim();
  return collapsed.length > MAX_CELL ? collapsed.slice(0, MAX_CELL) : collapsed;
}

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

/** RFC 4180: quoted fields, escaped quotes, and newlines inside a cell. */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A byte order mark would otherwise become part of the first header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }

    if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += char;

    if (rows.length > IMPORT_LIMITS.maxRows + 50) {
      throw new SpreadsheetError(
        `That file has more than ${IMPORT_LIMITS.maxRows} rows. Split it into smaller files.`,
      );
    }
  }

  if (quoted) throw new SpreadsheetError("That file has an unclosed quotation mark.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Picks the delimiter from the header line rather than trusting the extension. */
function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/** Finds the end-of-central-directory record, which indexes the archive. */
function findEndOfDirectory(bytes: Buffer): number {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i -= 1) {
    if (bytes.readUInt32LE(i) === ZIP_END_OF_DIRECTORY) return i;
  }
  return -1;
}

/**
 * An .xlsx file is a ZIP of XML. Rather than depend on a spreadsheet library
 * that can also write formulas, evaluate them and read macros, this walks the
 * ZIP central directory itself and inflates only the entries it needs:
 * the first worksheet, the shared string table, and styles (to recognise date
 * columns). Everything else in the archive is never even decompressed.
 */
function readWantedEntries(bytes: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const eocd = findEndOfDirectory(bytes);
  if (eocd < 0) throw new SpreadsheetError("That file is not a readable Excel workbook.");

  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.length) break;
    if (bytes.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY) break;

    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (!want(name)) continue;

    // Refuse anything absurd before spending the memory inflating it, so a
    // small archive claiming to expand to gigabytes is rejected, not attempted.
    if (uncompressedSize > 64 * 1024 * 1024) {
      throw new SpreadsheetError("That workbook is too large to read.");
    }
    if (localOffset + 30 > bytes.length) continue;

    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    try {
      entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    } catch {
      throw new SpreadsheetError(
        "That workbook could not be read. Try opening it and saving it again as .xlsx.",
      );
    }
  }

  return entries;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decodes only the five predefined entities plus numeric ones. No DTDs, ever. */
function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/** Concatenates every <t> inside a fragment: a string can span several runs. */
function textRuns(fragment: string): string {
  const parts = fragment.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return decodeXml(parts.map((p) => p.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, "$1")).join(""));
}

function sharedStrings(xml: string): string[] {
  const items = xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) ?? [];
  return items.map(textRuns);
}

/** "BC7" -> 54 (zero-based column index). */
function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Excel keeps dates as serial numbers. A Date of Birth column would otherwise
 * arrive as 45000, so a numeric cell whose style is a date format is rendered
 * back as an ISO date.
 */
function serialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  // Day 1 is 1900-01-01, and the 1900 leap-year bug means day 60 does not exist.
  const days = serial > 59 ? serial - 1 : serial;
  const date = new Date(Date.UTC(1900, 0, 1) + (days - 1) * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseSheet(xml: string, strings: string[], dateStyles: Set<number>): string[][] {
  const rows: string[][] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) ?? []) {
    const row: string[] = [];
    for (const cellXml of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
      const reference = cellXml.match(/\sr="([A-Z]+\d+)"/)?.[1];
      const index = reference ? columnIndex(reference) : row.length;
      if (index < 0 || index >= IMPORT_LIMITS.maxColumns) continue;

      const type = cellXml.match(/\st="(\w+)"/)?.[1] ?? "n";
      const style = Number(cellXml.match(/\ss="(\d+)"/)?.[1] ?? NaN);

      let value = "";
      if (type === "inlineStr") {
        value = textRuns(cellXml);
      } else {
        // The cached value only. <f> is the formula and is never looked at.
        const raw = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const decoded = decodeXml(raw);
        if (type === "s") value = strings[Number(decoded)] ?? "";
        else if (type === "b") value = decoded === "1" ? "TRUE" : "FALSE";
        else if (type === "n" && dateStyles.has(style)) {
          value = serialToIsoDate(Number(decoded)) ?? decoded;
        } else value = decoded;
      }

      while (row.length < index) row.push("");
      row[index] = trimCell(value);
    }
    rows.push(row);
    if (rows.length > IMPORT_LIMITS.maxRows + 50) {
      throw new SpreadsheetError(
        `That workbook has more than ${IMPORT_LIMITS.maxRows} rows. Split it into smaller files.`,
      );
    }
  }
  return rows;
}

/** Style indexes whose number format is a date, so serials can be converted. */
function dateStyleIndexes(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;

  const builtinDates = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const customDates = new Set<number>();
  for (const fmt of stylesXml.match(/<numFmt\b[^>]*\/?>/g) ?? []) {
    const id = Number(fmt.match(/numFmtId="(\d+)"/)?.[1] ?? NaN);
    const code = fmt.match(/formatCode="([^"]*)"/)?.[1] ?? "";
    if (Number.isFinite(id) && /[dmy]/i.test(code) && !/[#0]/.test(code)) customDates.add(id);
  }

  const cellXfs = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  const xfs = cellXfs.match(/<xf\b[^>]*\/?>/g) ?? [];
  xfs.forEach((xf, index) => {
    const id = Number(xf.match(/numFmtId="(\d+)"/)?.[1] ?? NaN);
    if (builtinDates.has(id) || customDates.has(id)) out.add(index);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Reads the first sheet of a CSV or XLSX upload into a header row plus rows. */
export function readSpreadsheet(bytes: Buffer): Sheet {
  if (bytes.length === 0) throw new SpreadsheetError("That file is empty.");
  if (bytes.length > IMPORT_LIMITS.maxBytes) {
    throw new SpreadsheetError(
      `That file is larger than ${Math.round(
        IMPORT_LIMITS.maxBytes / 1024 / 1024,
      )} MB. Export just the attendee sheet and try again.`,
    );
  }

  // The leading bytes decide, not the file name: a workbook saved as .csv still
  // reads, and a renamed archive cannot smuggle anything past the reader.
  const magic = bytes.length >= 4 ? bytes.readUInt32LE(0) : 0;

  if (magic === OLE_MAGIC) {
    throw new SpreadsheetError(
      "That looks like an older .xls file. Open it and save as .xlsx or .csv, then try again.",
    );
  }

  let table: string[][];
  if (magic === ZIP_MAGIC) {
    const entries = readWantedEntries(
      bytes,
      (name) =>
        name === "xl/sharedStrings.xml" ||
        name === "xl/styles.xml" ||
        /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
    );
    const sheetName = [...entries.keys()]
      .filter((name) => name.startsWith("xl/worksheets/"))
      .sort()[0];
    if (!sheetName) throw new SpreadsheetError("That workbook has no readable sheet.");

    table = parseSheet(
      entries.get(sheetName)!.toString("utf8"),
      sharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? ""),
      dateStyleIndexes(entries.get("xl/styles.xml")?.toString("utf8")),
    );
  } else {
    const text = bytes.toString("utf8");
    table = parseDelimited(text, sniffDelimiter(text)).map((row) => row.map(trimCell));
  }

  // Not simply the first non-empty row: a church's own spreadsheet often opens
  // with a title line above the real column names.
  const headerIndex = detectHeaderRow(table);
  if (headerIndex < 0) throw new SpreadsheetError("That file has no rows in it.");

  const headers = (table[headerIndex] ?? []).slice(0, IMPORT_LIMITS.maxColumns);
  const rows = table
    .slice(headerIndex + 1)
    .map((row) => row.slice(0, headers.length))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length > IMPORT_LIMITS.maxRows) {
    throw new SpreadsheetError(
      `That file has ${rows.length} rows. Ready Set Amen imports up to ${IMPORT_LIMITS.maxRows} at a time.`,
    );
  }

  return { headers, rows };
}
