import Link from "next/link";
import type { Entitlement } from "@prisma/client";
import { isPaid } from "@/lib/entitlement";
import { LAUNCH_PRICE } from "@/lib/pricing";

/**
 * The one place the app mentions money while a leader is working.
 *
 * Small, quiet, and only where someone would go looking: the organization
 * header and the settings page. The rest of the product never turns into an
 * advertisement — a church that has not paid yet is a customer setting up, not
 * a lead to be pestered.
 */
export function FreeSetupBadge({
  entitlement,
  slug,
  returnTo,
}: {
  entitlement: Entitlement;
  slug: string;
  returnTo?: string;
}) {
  if (isPaid(entitlement)) return null;

  const href = returnTo
    ? `/orgs/${slug}/unlock?next=${encodeURIComponent(returnTo)}`
    : `/orgs/${slug}/unlock`;

  return (
    <Link
      href={href}
      className="inline-flex min-h-[32px] max-w-full items-center gap-2 rounded-full border border-gold/50 bg-gold-soft px-3 py-1 text-[11px] font-bold text-gold-deep hover:brightness-95"
    >
      <span className="uppercase tracking-wide">Free setup</span>
      <span aria-hidden="true" className="text-gold-deep/50">
        ·
      </span>
      <span className="truncate font-semibold">Unlock lifetime access — {LAUNCH_PRICE}</span>
    </Link>
  );
}
