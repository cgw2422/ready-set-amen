import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * Platform-level authorization, for Ready Set Amen itself rather than for any
 * church inside it.
 *
 * This is deliberately unrelated to `OrganizationMember.role`. Owning a church
 * grants nothing here, and holding this grants nothing inside any church beyond
 * the aggregate counts the admin pages show. The two are separate concepts and
 * one is never derived from the other.
 *
 * Every admin page, route handler and server action calls `requirePlatformAdmin`
 * for itself. Hiding navigation is not authorization, and neither is having got
 * past the check on the page that linked here.
 */

export type PlatformAdmin = { userId: string; email: string; name: string };

/**
 * Resolves the caller and confirms the role from the database, every time.
 *
 * `notFound()` rather than a 403: a signed-in leader poking at /admin learns
 * only that there is no such page, which is also what an unauthenticated
 * visitor sees.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const user = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, firstName: true, lastName: true, platformRole: true },
  });
  if (!row || row.platformRole !== "PLATFORM_ADMIN") notFound();

  return {
    userId: row.id,
    email: row.email,
    name: `${row.firstName} ${row.lastName}`.trim(),
  };
}

/** For rendering a link only when it would work. Never used as the gate. */
export async function isPlatformAdmin(): Promise<boolean> {
  const user = await requireUser().catch(() => null);
  if (!user) return false;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { platformRole: true },
  });
  return row?.platformRole === "PLATFORM_ADMIN";
}
