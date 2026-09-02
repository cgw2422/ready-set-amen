import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";

const COOKIE_NAME = "rsa_session";
const SESSION_DAYS = 30;
/** Refresh the sliding expiry at most once a day to avoid a write per request. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export async function createSession(userId: string, ua?: string) {
  const jarBefore = await cookies();
  const previous = jarBefore.get(COOKIE_NAME)?.value;

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  // Signing in mints a brand-new token and destroys whatever token the browser
  // arrived with, so a fixated or previously captured cookie stops working at
  // the moment of login rather than lingering until it expires.
  if (previous) {
    await prisma.session
      .deleteMany({ where: { tokenHash: sha256(previous) } })
      .catch(() => undefined);
  }

  // Opportunistically clear this user's expired rows so the table does not
  // accumulate dead sessions.
  await prisma.session
    .deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
    .catch(() => undefined);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: ua?.slice(0, 512),
    },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: sha256(token) } })
      .catch(() => undefined);
  }
  jar.delete(COOKIE_NAME);
}

/** Cached per request so a page tree resolves the user once. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
        },
      })
      .catch(() => undefined);
  }

  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
