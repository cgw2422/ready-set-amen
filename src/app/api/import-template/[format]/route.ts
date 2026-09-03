import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { csvTemplate, xlsxTemplate } from "@/lib/import/template";

/**
 * The downloadable attendee templates.
 *
 * Signed in but not otherwise restricted: the templates are blank column
 * headings and two invented people, so they are free for anyone with an
 * account — downloading one is not a paid feature, and neither is importing.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ format: string }> },
) {
  await requireUser();
  const { format } = await params;

  if (format === "csv") {
    return new NextResponse(csvTemplate(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ready-set-amen-attendees.csv"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (format === "xlsx") {
    const body = xlsxTemplate();
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="ready-set-amen-attendees.xlsx"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return NextResponse.json({ error: "Unknown template format." }, { status: 404 });
}
