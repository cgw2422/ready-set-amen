import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { listOrganizations, type OrgFilter, type OrgSort } from "@/lib/admin/directory";
import {
  EntitlementTag,
  Panel,
  Td,
  Th,
  TableWrap,
  formatDate,
  formatNumber,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations", robots: { index: false, follow: false } };

const FILTERS: Array<{ value: OrgFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "FREE_SETUP", label: "Free setup" },
  { value: "LIFETIME", label: "Lifetime" },
  { value: "MANUAL_LIFETIME", label: "Manual" },
  { value: "DEMO", label: "Demo" },
];

const SORTS: Array<{ value: OrgSort; label: string }> = [
  { value: "created", label: "Created" },
  { value: "trips", label: "Trips" },
  { value: "attendees", label: "Attendees" },
  { value: "activity", label: "Last activity" },
];

export default async function AdminOrganizations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string }>;
}) {
  await requirePlatformAdmin();
  const { q = "", filter = "all", sort = "created" } = await searchParams;

  const activeFilter = (FILTERS.find((f) => f.value === filter)?.value ?? "all") as OrgFilter;
  const activeSort = (SORTS.find((s) => s.value === sort)?.value ?? "created") as OrgSort;
  const rows = await listOrganizations({ search: q, filter: activeFilter, sort: activeSort });

  const href = (next: Partial<{ q: string; filter: string; sort: string }>) => {
    const params = new URLSearchParams();
    const merged = { q, filter: activeFilter, sort: activeSort, ...next };
    if (merged.q) params.set("q", merged.q);
    if (merged.filter !== "all") params.set("filter", merged.filter);
    if (merged.sort !== "created") params.set("sort", merged.sort);
    const query = params.toString();
    return `/admin/organizations${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-navy">
        Organizations
      </h1>

      <form action="/admin/organizations" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Organization name or owner email"
          aria-label="Search organizations"
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-navy"
        />
        {activeFilter !== "all" ? (
          <input type="hidden" name="filter" value={activeFilter} />
        ) : null}
        {activeSort !== "created" ? <input type="hidden" name="sort" value={activeSort} /> : null}
        <button
          type="submit"
          className="min-h-[44px] rounded-xl bg-green-brand px-4 font-semibold text-white"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={href({ filter: option.value })}
            className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-semibold ${
              activeFilter === option.value
                ? "bg-navy text-white"
                : "border border-line bg-white text-navy hover:bg-cream"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Panel
        title={`${formatNumber(rows.length)} shown`}
        description="Counts only. No attendee, medical, emergency or waiver information appears here."
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Organization</Th>
              <Th>Owner email</Th>
              <Th>Entitlement</Th>
              <Th numeric href={href({ sort: "trips" })} active={activeSort === "trips"}>
                Trips
              </Th>
              <Th numeric href={href({ sort: "attendees" })} active={activeSort === "attendees"}>
                Attendees
              </Th>
              <Th numeric>Signed</Th>
              <Th href={href({ sort: "created" })} active={activeSort === "created"}>
                Created
              </Th>
              <Th href={href({ sort: "activity" })} active={activeSort === "activity"}>
                Last activity
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td>
                  <span className="text-navy-soft">No organizations match.</span>
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`/admin/organizations/${row.id}`}
                      className="font-semibold text-green-deep hover:underline"
                    >
                      {row.name}
                    </Link>
                  </Td>
                  <Td muted>{row.ownerEmail ?? "—"}</Td>
                  <Td>
                    <EntitlementTag entitlement={row.entitlement} />
                  </Td>
                  <Td numeric>{formatNumber(row.trips)}</Td>
                  <Td numeric>{formatNumber(row.attendees)}</Td>
                  <Td numeric>{formatNumber(row.signedWaivers)}</Td>
                  <Td muted>{formatDate(row.createdAt)}</Td>
                  <Td muted>{formatDate(row.lastActivity)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Panel>

      <p className="text-xs text-navy-faint">
        <strong className="font-semibold text-navy-soft">Last activity</strong> is the most recent
        change to the organization or any of its trips.
      </p>
    </div>
  );
}
