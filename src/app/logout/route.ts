import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { appUrl } from "@/lib/request";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/login", appUrl()), { status: 303 });
}
