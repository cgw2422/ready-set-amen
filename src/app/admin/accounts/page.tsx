import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { listAccounts } from "@/lib/admin/directory";
import { Panel, Td, Th, TableWrap, formatDate, formatNumber } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts", robots: { index: false, follow: false } };

export default async function AdminAccounts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin();
  const { q = "" } = await searchParams;
  const rows = await listAccounts(q);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-navy">
        Accounts
      </h1>

      <form action="/admin/accounts" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name or email"
          aria-label="Search accounts"
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-navy"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-xl bg-green-brand px-4 font-semibold text-white"
        >
          Search
        </button>
      </form>

      <Panel
        title={`${formatNumber(rows.length)} shown`}
        description="Identity and membership only. No password hashes, tokens or session data."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Created</Th>
              <Th>Platform role</Th>
              <Th>Organizations</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td>
                  <span className="text-navy-soft">No accounts match.</span>
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`/admin/accounts/${row.id}`}
                      className="font-semibold text-green-deep hover:underline"
                    >
                      {row.name || "—"}
                    </Link>
                  </Td>
                  <Td muted>{row.email}</Td>
                  <Td muted>{formatDate(row.createdAt)}</Td>
                  <Td>
                    {row.platformRole === "PLATFORM_ADMIN" ? (
                      <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-gold-deep">
                        Platform admin
                      </span>
                    ) : (
                      <span className="text-navy-faint">User</span>
                    )}
                  </Td>
                  <Td>
                    {row.organizations.length === 0 ? (
                      <span className="text-navy-faint">None</span>
                    ) : (
                      row.organizations
                        .map((org) => `${org.name}${org.isDemo ? " (demo)" : ""}`)
                        .join(", ")
                    )}
                  </Td>
                  <Td muted>{formatDate(row.lastActivity)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <p className="text-xs text-navy-faint">
        <strong className="font-semibold text-navy-soft">Last sign-in</strong> is the last time this
        account successfully logged in.
      </p>
    </div>
  );
}
