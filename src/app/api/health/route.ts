import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Platform health check. Reports the database too, because "the web process is
 * up but Postgres isn't attached" is the failure a deploy actually hits, and a
 * check that only proves Node started would call that healthy.
 *
 * Deliberately reveals nothing beyond up/down — no versions, no hostnames.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
