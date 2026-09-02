"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { clientIp, userAgent } from "@/lib/request";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/format";

export type FormState = { error?: string; ok?: boolean };

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200, "That password is too long"),
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const limit = rateLimit(`signup:${ip}`, LIMITS.signup.limit, LIMITS.signup.windowMs);
  if (!limit.allowed) {
    return { error: "Too many sign-up attempts. Please try again shortly." };
  }

  const parsed = signupSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const { firstName, lastName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  const user = await prisma.user.create({
    data: { email, firstName, lastName, passwordHash: await hashPassword(password) },
    select: { id: true },
  });

  await createSession(user.id, await userAgent());
  redirect("/onboarding");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();

  // Limit by IP and by account so neither a single address nor a single target
  // can be hammered.
  const ipLimit = rateLimit(`login:ip:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
  const acctLimit = rateLimit(`login:acct:${emailRaw}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!ipLimit.allowed || !acctLimit.allowed) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  const parsed = loginSchema.safeParse({ email: emailRaw, password: formData.get("password") });
  // One message for every failure mode — no account enumeration.
  const genericError = "That email or password doesn't match our records.";
  if (!parsed.success) return { error: genericError };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    // Spend comparable time so a missing account isn't detectable by timing.
    await hashPassword(parsed.data.password);
    return { error: genericError };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { error: genericError };

  await createSession(user.id, await userAgent());

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  redirect(membership ? `/orgs/${membership.organization.slug}` : "/onboarding");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const orgSchema = z.object({
  name: z.string().trim().min(2, "Enter your church or organization name").max(120),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
});

export async function createOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = orgSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const base = slugify(parsed.data.name) || "church";
  let slug = base;
  for (let i = 2; i < 60; i += 1) {
    const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) break;
    slug = `${base}-${i}`;
  }

  const organization = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { slug: true },
  });

  redirect(`/orgs/${organization.slug}`);
}
