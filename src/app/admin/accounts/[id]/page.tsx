import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform";
import { accountDetail } from "@/lib/admin/directory";
import { Panel, formatDate } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account", robots: { index: false, follow: false } };

export default async function AdminAccountDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const account = await accountDetail(id);
  if (!account) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/accounts"
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-green-brand"
      >
        &lsaquo; All accounts
      </Link>

      <h1 className="font-display text-2xl font-extrabold text-navy">{account.name || account.email}</h1>

      <Panel title="Details">
        <dl className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
          <Row label="Email" value={account.email} />
          <Row label="Created" value={formatDate(account.createdAt)} />
          <Row
            label="Platform role"
            value={account.platformRole === "PLATFORM_ADMIN" ? "Platform admin" : "User"}
          />
          <Row label="Last sign-in" value={formatDate(account.lastActivity)} />
        </dl>
      </Panel>

      <Panel title="Organization memberships">
        {account.organizations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-navy-soft">
            No memberships yet — this account signed up but has not created a church.
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {account.organizations.map((org, index) => (
              <li key={index} className="flex flex-wrap gap-x-3 px-4 py-3 text-sm">
                <span className="font-semibold text-navy">{org.name}</span>
                <span className="text-navy-soft">{org.role}</span>
                {org.isDemo ? <span className="text-navy-faint">demo</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs leading-relaxed text-navy-faint">
        Password hashes, reset tokens, session tokens and invitation tokens are never loaded by this
        page.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-navy-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-navy">{value}</dd>
    </div>
  );
}
