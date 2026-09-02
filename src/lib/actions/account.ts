"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { destroySession } from "@/lib/auth";
import {
  completePasswordReset,
  findValidResetToken,
  issuePasswordResetToken as mintResetToken,
} from "@/lib/account-service";
import { appUrl, clientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { mailEnabled, passwordResetMessage, sendMail } from "@/lib/mailer";
import type { FormState } from "@/lib/actions/auth";

const RESET_LIMITS = {
  perIp: { limit: 10, windowMs: 60 * 60_000 },
  perEmail: { limit: 4, windowMs: 60 * 60_000 },
};

export type ResetRequestState = FormState & {
  /**
   * Development convenience only. Populated when no mail provider is
   * configured AND the app is not running in production, so a self-hosted
   * developer is not locked out. Never set in production.
   */
  devLink?: string;
  sent?: boolean;
};

/** Mints a reset link. Shared by the public flow and owner-assisted recovery. */
export async function issuePasswordResetToken(
  userId: string,
  requestedIp?: string | null,
): Promise<string> {
  const token = await mintResetToken(userId, requestedIp);
  return `${appUrl()}/reset-password/${token}`;
}

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

/**
 * Always answers the same way, whether or not the address belongs to an
 * account. The response must not become an account-existence oracle, so the
 * rate-limit rejection is worded identically too.
 */
export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const ip = await clientIp();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();

  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`reset:ip:${ip}`, RESET_LIMITS.perIp.limit, RESET_LIMITS.perIp.windowMs),
    rateLimit(`reset:email:${emailRaw}`, RESET_LIMITS.perEmail.limit, RESET_LIMITS.perEmail.windowMs),
  ]);

  const parsed = requestSchema.safeParse({ email: emailRaw });

  // One response for every path: unknown address, valid address, malformed
  // address, or rate limited.
  const generic: ResetRequestState = { ok: true, sent: true };

  if (!parsed.success || !ipLimit.allowed || !emailLimit.allowed) return generic;

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, firstName: true },
  });
  if (!user) return generic;

  const url = await issuePasswordResetToken(user.id, ip === "unknown" ? null : ip);

  if (mailEnabled()) {
    await sendMail(passwordResetMessage({ to: parsed.data.email, firstName: user.firstName, url }));
    return generic;
  }

  if (process.env.NODE_ENV !== "production") {
    return { ...generic, devLink: url };
  }

  // Production with no mail provider: the token is never printed to a page or
  // a log. An owner can hand out a reset link from organization settings.
  return generic;
}

const resetSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Those passwords don't match",
    path: ["confirm"],
  });

export type ResetTokenCheck = { valid: true; firstName: string } | { valid: false };

/** Read-only validation used to render the reset form. Never consumes the token. */
export async function checkResetToken(token: string): Promise<ResetTokenCheck> {
  const lookup = await findValidResetToken(token);
  return lookup.valid ? { valid: true, firstName: lookup.firstName } : { valid: false };
}

export async function resetPasswordAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ip = await clientIp();
  const limit = await rateLimit(`reset-submit:${ip}`, 20, 60 * 60_000);
  if (!limit.allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const outcome = await completePasswordReset(token, parsed.data.password);
  if (!outcome.ok) {
    return { error: "This reset link is no longer valid. Please request a new one." };
  }

  // The person resetting is signed out too, and signs in with the new password.
  await destroySession();
  redirect("/login?reset=1");
}
