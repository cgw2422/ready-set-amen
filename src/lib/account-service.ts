import { prisma } from "@/lib/db";
import { generateToken, hashPassword, sha256 } from "@/lib/crypto";

/**
 * Password reset token lifecycle.
 *
 * Kept out of the server-action layer so it can be exercised directly by tests:
 * expiry, single use, and session invalidation are database behaviours, and a
 * test that cannot reach them is not testing anything.
 *
 * Reset links are short lived. They arrive in an inbox, which is exactly where
 * a stale link sits around waiting to be found.
 */
export const RESET_TTL_MINUTES = 30;

export type ResetFailure = "invalid" | "expired" | "used";

/** Mints a token, invalidating any other live token for the account. */
export async function issuePasswordResetToken(
  userId: string,
  requestedIp?: string | null,
): Promise<string> {
  const token = generateToken(32);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
        requestedIp: requestedIp ?? null,
      },
    }),
  ]);

  return token;
}

export type ResetTokenLookup =
  | { valid: true; userId: string; firstName: string }
  | { valid: false; reason: ResetFailure };

/** Read-only check used to render the form. Never consumes the token. */
export async function findValidResetToken(token: string): Promise<ResetTokenLookup> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    return { valid: false, reason: "invalid" };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { firstName: true } },
    },
  });

  if (!record) return { valid: false, reason: "invalid" };
  if (record.usedAt) return { valid: false, reason: "used" };
  if (record.expiresAt.getTime() < Date.now()) return { valid: false, reason: "expired" };
  return { valid: true, userId: record.userId, firstName: record.user.firstName };
}

export type ResetOutcome = { ok: true; userId: string } | { ok: false; reason: ResetFailure };

/**
 * Sets the new password and burns everything else down: the token, every other
 * outstanding token for the account, and every session on every device. If the
 * reset was prompted by a compromise, leaving old sessions alive would defeat
 * the whole point.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<ResetOutcome> {
  const lookup = await findValidResetToken(token);
  if (!lookup.valid) return { ok: false, reason: lookup.reason };

  const passwordHash = await hashPassword(newPassword);

  const [, claimed] = await prisma.$transaction([
    prisma.user.update({ where: { id: lookup.userId }, data: { passwordHash } }),
    // The where-clause re-checks usedAt inside the transaction, so two
    // submissions cannot both succeed.
    prisma.passwordResetToken.updateMany({
      where: { tokenHash: sha256(token), usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: lookup.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: lookup.userId } }),
  ]);

  if (claimed.count === 0) return { ok: false, reason: "used" };
  return { ok: true, userId: lookup.userId };
}
