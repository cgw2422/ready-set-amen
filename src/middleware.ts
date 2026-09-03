import { NextResponse, type NextRequest } from "next/server";
import {
  appHost,
  hostname,
  isMarketingPath,
  isSharedPath,
  marketingHost,
  splitHosting,
} from "@/lib/hosts";

/**
 * Keeps the marketing site and the application on their own domains without
 * running them as separate deployments. When MARKETING_HOST and APP_HOST are
 * both set:
 *
 *   www.readysetamen.com/*   → readysetamen.com/*        (permanent)
 *   readysetamen.com/orgs/1  → app.readysetamen.com/...  (the app's own paths)
 *   app.readysetamen.com/    → the application, not the landing page
 *
 * With either variable unset — locally, in tests, on a bare Railway domain —
 * nothing is redirected and one host serves everything.
 */
export function middleware(request: NextRequest) {
  if (!splitHosting()) return NextResponse.next();

  const host = hostname(request.headers.get("host"));
  const marketing = marketingHost()!;
  const app = appHost()!;
  const { pathname, search } = request.nextUrl;

  if (isSharedPath(pathname)) return NextResponse.next();

  // A safety net rather than the usual path: www is normally redirected at the
  // DNS provider and never reaches the app at all. This only fires if someone
  // points www at this service.
  if (host === `www.${marketing}`) {
    return NextResponse.redirect(new URL(`https://${marketing}${pathname}${search}`), 308);
  }

  if (host === marketing && !isMarketingPath(pathname)) {
    return NextResponse.redirect(new URL(`https://${app}${pathname}${search}`), 307);
  }

  if (host === app && isMarketingPath(pathname)) {
    // Someone signed in landing on the app root wants their trips, not the pitch.
    return NextResponse.redirect(new URL(`https://${app}/orgs`), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
