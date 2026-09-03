import "server-only";
import { deflateRawSync } from "node:zlib";
import { TEMPLATE_HEADERS } from "@/lib/import/mapping";

/**
 * The downloadable starting point: the same column order Ready Set Amen reads,
 * with two obviously invented people in it so the shape is clear.
 *
 * The .xlsx is written here rather than with a spreadsheet library. Writing one
 * is a ZIP of four small XML files, and doing it directly keeps a dependency
 * that can also evaluate formulas out of the project entirely — which is the
 * same reason the reader is first-party.
 */

/** Fictional. Two rows, one minor with a guardian and one adult leader. */
const SAMPLE_ROWS: string[][] = [
  [
    "Ethan",
    "Miller",
    "",
    "Male",
    "2011-04-18",
    "Minor",
    "",
    "",
    "Rachel Miller",
    "rachel.miller@example.com",
    "555-0142",
    "Rachel Miller",
    "555-0142",
    "Peanuts",
    "",
    "",
    "",
    "YL",
    "",
    "Partial",
    "25",
  ],
  [
    "Olivia",
    "Johnson",
    "Liv",
    "Female",
    "1988-09-02",
    "Adult",
    "555-0177",
    "olivia.johnson@example.com",
    "",
    "",
    "",
    "Marcus Johnson",
    "555-0178",
    "",
    "",
    "",
    "Vegetarian",
    "M",
    "Driving the church van",
    "Paid",
    "95",
  ],
];

/**
 * Quotes a CSV field, and defuses anything a spreadsheet would treat as a
 * formula. Ready Set Amen never writes a live formula into a file a church
 * opens, even in a template of its own making.
 */
function csvCell(value: string): string {
  const safe = /^[=+@\t\r]|^-{2,}/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvTemplate(): string {
  const lines = [TEMPLATE_HEADERS, ...SAMPLE_ROWS].map((row) => row.map(csvCell).join(","));
  // A BOM so Excel on Windows opens it as UTF-8 rather than mangling names.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(): string {
  const rows = [TEMPLATE_HEADERS, ...SAMPLE_ROWS]
    .map((cells, rowIndex) => {
      const cellXml = cells
        .map((value, columnIndex) =>
          value === ""
            ? ""
            : `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(
                value,
              )}</t></is></c>`,
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cellXml}</row>`;
    })
    .join("");

  // Every value is written as an inline string, so no cell in this template is
  // ever a formula and there is no shared string table to get out of step.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Attendees" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** CRC-32, which the ZIP format requires per entry. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

/** Minimal ZIP writer: stored sizes known up front, no data descriptors. */
function zip(files: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const deflated = deflateRawSync(raw, { level: 9 });
    const checksum = crc32(raw);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1 Jan 1980, so downloads are reproducible
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    locals.push(local, deflated);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length + deflated.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, directory, end]);
}

export function xlsxTemplate(): Buffer {
  return zip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "xl/workbook.xml", content: WORKBOOK },
    { name: "xl/_rels/workbook.xml.rels", content: WORKBOOK_RELS },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml() },
  ]);
}

/**
 * A Google Sheets starter, if one is configured. Just a URL: Ready Set Amen
 * never asks for access to anyone's Google account, and there is no OAuth or
 * Drive API here to need it. The visitor makes their own copy, fills it in, and
 * downloads it as CSV or XLSX like any other spreadsheet.
 */
export function googleSheetsTemplateUrl(): string | null {
  const raw = process.env.GOOGLE_SHEETS_TEMPLATE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Only ever link out to Google's own domains, so a misconfigured variable
    // cannot turn this button into an open redirect.
    if (url.protocol !== "https:") return null;
    if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
