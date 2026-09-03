import type { OrgRole } from "@prisma/client";

/**
 * What a role may do, as pure predicates.
 *
 * Deliberately coarse (docs/ARCHITECTURE.md §10): there is no permissions
 * matrix. OWNER manages the organization itself — leaders, ownership, the
 * waiver acknowledgement, billing, deletion. Everyone else manages trips and
 * trip data.
 *
 * Kept apart from `access.ts` so asking "is this person the owner?" does not
 * require Next's routing or a database connection.
 */

export function canManageOrg(role: OrgRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function isOwner(role: OrgRole): boolean {
  return role === "OWNER";
}
