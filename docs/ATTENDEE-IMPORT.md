# Importing attendees from a spreadsheet

Most churches already have their people in a spreadsheet. This is how it gets
into Ready Set Amen — and why the parser is deliberately first-party.

**People → Import CSV / Excel**, or `/orgs/:slug/trips/:tripId/people/import`.

Importing is **free**. The ten-person limit in free setup is the only attendee
boundary, and it applies the same way however people are entered.

---

## The flow

Nothing is written when a file is uploaded.

1. Choose a `.csv` or `.xlsx` file
2. The server parses it and detects the header row
3. Recognised columns are mapped automatically
4. Any column can be re-pointed, or set to **Ignore this column**
5. Every row is validated
6. A preview shows each person and a status
7. Rows can be turned off individually
8. Confirming imports only the rows still ticked
9. A summary says how many were added, skipped, and need attention

Re-reading with different mappings costs nothing, because until the last step
no attendee exists. The file is posted again with the confirmation so the
server validates every row itself rather than trusting a preview the browser
handed back.

## Supported files

`.csv` (comma, tab or semicolon separated) and `.xlsx`. A legacy `.xls` is
recognised by its signature and answered with "open it and save as .xlsx or
.csv" rather than mis-parsed as text.

The format is decided by the file's leading bytes, not its name, so a workbook
saved as `.csv` still reads and a renamed archive cannot smuggle anything past.

## Limits

These apply to everyone, paid included. They are not a pricing boundary — they
bound what one upload can ask of one request.

| | |
| --- | --- |
| File size | 2 MB (a 1,000-person CSV is roughly 150 KB) |
| Rows per file | 1,000 |
| Columns read | 60 |
| Characters per cell | 2,000 |

## Columns recognised automatically

First Name, Last Name, Preferred Name, Gender, Date of Birth, Adult / Minor,
Phone, Email, Parent / Guardian Name, Parent / Guardian Email, Parent /
Guardian Phone, Emergency Contact Name, Emergency Contact Phone, Allergies,
Medical Conditions, Medications, Dietary Restrictions, Shirt Size, Notes,
Payment Status, Amount Paid.

Common variants are matched after normalising case and punctuation, so `FName`,
`Surname`, `DOB`, `Cell Phone`, `Parent/Guardian`, `Medical Notes` and
`Dietary Needs` all land in the right place. **Anything unrecognised is left
for the leader to set** — silently importing a phone number into the notes
field is worse than asking. Two columns never map to the same field.

**Only First Name and Last Name are required.** Missing optional data is not a
reason to reject an import; it shows up later through the normal readiness and
outstanding-item warnings.

## Adult / minor

| What the file has | What happens |
| --- | --- |
| Date of birth only | Minor status is derived using the app's existing age logic |
| Adult / Minor only | The stated value is used |
| Both, and they agree | Fine |
| Both, and they disagree | **ERROR** — "Adult / Minor conflicts with Date of Birth" |
| Neither | Imported, flagged as needing attention |

A contradiction is never silently corrected: one of the two values is wrong and
only the church knows which.

## Row statuses

| | |
| --- | --- |
| **READY** | Imports cleanly |
| **WARNING** | Imports; something is worth revisiting (a minor with no guardian email, an emergency contact missing its phone) |
| **ERROR** | Never imports — a missing name, an invalid date of birth or email, an unrecognised payment status, or an adult/minor conflict |
| **POSSIBLE DUPLICATE** | Someone with this name is already on the trip. Import anyway or turn the row off |

## Duplicate detection

Two people genuinely can share a name, so a match is a question rather than a
decision. Same first and last name **and** the same date of birth is treated as
a strong match; the same name alone is still flagged, but importable. Repeats
within one file are flagged too.

## Templates

On the import screen:

- **Download CSV** — `/api/import-template/csv`
- **Download Excel** — `/api/import-template/xlsx`
- **Open Google Sheets Template** — only when configured

Both carry all 21 columns in the order above and two obviously invented sample
rows (Ethan Miller, a minor with a guardian; Olivia Johnson, an adult leader)
using `example.com` addresses and 555-01xx phone numbers, both reserved for
fiction. The CSV never writes a live formula, even in its own sample data.

### Configuring the Google Sheets template

```
GOOGLE_SHEETS_TEMPLATE_URL=https://docs.google.com/spreadsheets/d/<id>/edit
```

The button appears only when this is set, and only for a `https` URL on a
Google domain, so a mistyped variable cannot turn it into an open redirect.
There is no OAuth and no Drive API: Ready Set Amen never asks for access to
anyone's Google account. The visitor opens the template, makes their own copy,
fills it in, downloads it as CSV or Excel, and uploads it here.

Share the sheet as **anyone with the link can view** so a copy can be made.

## Free setup and the ten-person limit

Importing is free; the limit is on people.

| Situation | What happens |
| --- | --- |
| 0 people, import 10 | Allowed |
| 6 people, import 4 | Allowed |
| 8 people, import 5 | Preview shows "you can add 2 more"; turn rows off, or unlock |
| 10 people, import anything | Preview still works; importing needs lifetime access |

The preview always runs, so a leader can see their whole list mapped and
validated before deciding. Rows are chosen individually — Ready Set Amen never
silently picks the first two and drops the rest.

## Security

An uploaded spreadsheet is untrusted input from someone who may have been sent
it by a third party. `src/lib/import/spreadsheet.ts` is first-party for that
reason: it is *incapable* of doing anything but read text out of cells.

- **Formulas are never evaluated.** For XLSX it reads the cached `<v>` value and
  ignores the `<f>` formula element; there is no expression evaluator in the
  file to exploit.
- **Macros are never run.** Only the first worksheet, the shared string table
  and styles are decompressed. `xl/vbaProject.bin` is not among them, so a
  `.xlsm` renamed to `.xlsx` is inert.
- **No external anything.** No network, no filesystem, no external workbook
  references, no DTDs — only the five predefined XML entities plus numeric ones,
  so an entity-expansion attempt yields the literal text.
- **Bounded before parsed.** Bytes, rows, columns and cell length are all capped,
  and a ZIP entry claiming to expand past 64 MB is refused rather than inflated.
- **Never rendered as markup.** Values come back as strings and are escaped by
  React like any other text.
- **Formula injection is defused on the way in.** A cell starting `=`, `+`, `@`
  or a double `-` has the marker stripped and is kept as text, so it cannot
  become live again in a later export.
- **Nothing is retained.** The bytes live in the request that parsed them. No
  upload is written to disk, and no medical note, allergy, medication,
  emergency contact or parent detail is logged — parser failures return a fixed
  message rather than echoing the input.

`tests/import.test.ts` covers all of it, including a workbook carrying a macro,
a formula cell, an entity-expansion attempt, a truncated archive, an oversized
file and an injected `=cmd|...` name.
