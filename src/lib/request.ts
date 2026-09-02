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

/**
 * The public base URL used to build waiver signing links.
 *
 * Getting this wrong is not cosmetic: a link built against the wrong host is a
 * link a parent cannot open. APP_URL wins when set; otherwise we fall back to
 * the host the platform advertises (Railway and Vercel both provide one), so a
 * fresh deploy produces working links before anyone configures anything.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}`;
}
