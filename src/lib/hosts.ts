/**
 * Which site a request belongs to.
 *
 * Marketing and the application ship as one Next.js build on one Railway
 * service, separated by hostname rather than by deployment. Two services from
 * one repo would mean two builds, two sets of variables and two chances to
 * drift, to serve a landing page that shares this app's brand tokens, fonts and
 * components — and a second service costs money every month for a product whose
 * whole economics depend on near-zero variable cost.
 *
 * Both hosts serve the same routes; the middleware only decides which host owns
 * which path. Until the domains exist, MARKETING_HOST is unset and everything is
 * served from a single host with no redirects, which is also how the tests and
 * local development run.
 */

/** Marketing home, e.g. "readysetamen.com". Unset before DNS is configured. */
export function marketingHost(): string | null {
  return normalize(process.env.MARKETING_HOST);
}

/** Where the application lives, e.g. "app.readysetamen.com". */
export function appHost(): string | null {
  return normalize(process.env.APP_HOST);
}

function normalize(value: string | undefined): string | null {
  const host = value?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return host || null;
}

/** Strips the port so localhost:3000 and a Railway domain compare the same way. */
export function hostname(header: string | null): string {
  return (header ?? "").toLowerCase().split(":")[0];
}

/** True when the two domains are configured and therefore enforceable. */
export function splitHosting(): boolean {
  return marketingHost() !== null && appHost() !== null;
}

/** Paths the marketing host serves. Everything else there belongs to the app. */
const MARKETING_PATHS = ["/"];

/** Paths that stay on whichever host they were requested from. */
const SHARED_PREFIXES = ["/legal", "/api", "/_next", "/favicon", "/robots.txt", "/sitemap.xml"];

export function isSharedPath(pathname: string): boolean {
  return SHARED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.includes(pathname);
}

/** The canonical origin for a signing link, billing return, or a nav CTA. */
export function appOrigin(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = appHost();
  if (host) return `https://${host}`;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "http://localhost:3000";
}

export function marketingOrigin(): string {
  const host = marketingHost();
  return host ? `https://${host}` : appOrigin();
}
