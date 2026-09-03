import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { CheckBadge } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Platform admin",
  // Never let an admin URL end up in a search index.
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/purchases", label: "Purchases" },
];

/**
 * The platform admin shell.
 *
 * The layout checks the role, and so does every page inside it. That is
 * deliberate duplication: a layout is not an authorization boundary in the App
 * Router — a page can be rendered without it — so each page proves the role for
 * itself rather than trusting that something upstream did.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-line bg-navy text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="inline-flex min-h-[44px] shrink-0 items-center gap-2">
            <CheckBadge className="h-7 w-7 bg-white text-navy" />
            <span className="font-display text-base font-extrabold uppercase tracking-tight">
              Ready Set Amen
            </span>
            <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-navy">
              Admin
            </span>
          </Link>

          <nav aria-label="Platform admin" className="flex flex-wrap items-center gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/70 sm:inline">{admin.email}</span>
            <Link
              href="/orgs"
              className="inline-flex min-h-[40px] items-center rounded-lg border border-white/25 px-3 font-semibold text-white hover:bg-white/10"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
