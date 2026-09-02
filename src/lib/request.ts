import { headers } from "next/headers";

/** Best-effort client IP for audit records and rate limiting. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "unknown").slice(0, 512);
}

/**
 * Server Actions are already same-origin bound by Next.js, but the public
 * signing action handles bearer-token data so it checks Origin explicitly too.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return; // Non-browser or same-origin form post without Origin.
  const host = h.get("host");
  if (!host) throw new Error("Missing host header");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Invalid origin");
  }
  if (originHost !== host) throw new Error("Cross-origin request rejected");
}

export function appUrl(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
