"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Five thumb-reachable targets (docs/ARCHITECTURE.md §7). The raised centre
 * button opens the things a leader needs while standing beside a van.
 */
/**
 * The raised + is the leader's fast path. Every entry lands on a screen with
 * the form already open (`?new=1`), so it is two taps from anywhere in the
 * trip to a focused input — no scrolling to find an "Add" button.
 */
const QUICK_ACTIONS = [
  { label: "Add Person", href: "/people/new", hint: "One more name on the roster", icon: "person" },
  { label: "Run Headcount", href: "/headcount", hint: "Count everyone in under a minute", icon: "count" },
  { label: "Add Task", href: "/tasks?new=1", hint: "Something to remember", icon: "task" },
  { label: "Add Itinerary Item", href: "/itinerary?new=1", hint: "Keep the day on track", icon: "clock" },
  { label: "Add Vehicle", href: "/transportation?new=1", hint: "Van, bus, or car", icon: "van" },
  { label: "Add Room", href: "/lodging?new=1", hint: "Room, cabin, or dorm", icon: "bed" },
];

function ActionIcon({ name }: { name: string }) {
  const common = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  const paths: Record<string, React.ReactNode> = {
    person: (
      <>
        <circle cx="10" cy="8" r="3.2" {...common} />
        <path d="M4 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" {...common} />
        <path d="M18 5.5v5M15.5 8h5" {...common} />
      </>
    ),
    count: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" {...common} />
        <path d="M8.5 12.2l2.4 2.4 4.6-5" {...common} />
      </>
    ),
    task: (
      <>
        <path d="M6 4h9l4 4v12H6z" {...common} />
        <path d="M15 4v4h4M9 13h6M9 16.5h4" {...common} />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" {...common} />
        <path d="M12 7.5V12l3 1.8" {...common} />
      </>
    ),
    van: (
      <>
        <path d="M3 16V8.5A1.5 1.5 0 0 1 4.5 7h9l4 4h2.5A1.5 1.5 0 0 1 21 12.5V16" {...common} />
        <circle cx="7.5" cy="16.5" r="1.8" {...common} />
        <circle cx="16.5" cy="16.5" r="1.8" {...common} />
        <path d="M9.3 16.5h5.4M3 16.5h2.7M18.3 16.5H21" {...common} />
      </>
    ),
    bed: (
      <>
        <path d="M3 18v-7M3 13h18v5M21 18v-4.5a2.5 2.5 0 0 0-2.5-2.5H12v2.5" {...common} />
        <circle cx="7.5" cy="10" r="2" {...common} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
      {paths[name] ?? null}
    </svg>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = { stroke, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
          <path d="M3.5 11 12 4l8.5 7" {...common} />
          <path d="M5.5 9.6V20h13V9.6" {...common} />
        </svg>
      );
    case "people":
      return (
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" {...common} />
          <path d="M3.5 19.5c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5" {...common} />
          <path d="M16 6.2a3 3 0 0 1 0 5.6M17 14.8c2 .5 3.4 2.2 3.8 4.7" {...common} />
        </svg>
      );
    case "schedule":
      return (
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...common} />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...common} />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" {...common} />
          <path d="M8.5 12.2l2.4 2.4 4.6-5" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

const MORE_LINKS = [
  { label: "Schedule", href: "/itinerary" },
  { label: "Waivers", href: "/waivers" },
  { label: "Forms", href: "/forms" },
  { label: "Payments", href: "/payments" },
  { label: "Transportation", href: "/transportation" },
  { label: "Lodging", href: "/lodging" },
  { label: "Leaders", href: "/leaders" },
  { label: "Prayer", href: "/prayer" },
  { label: "Headcount", href: "/headcount" },
  { label: "Emergency info", href: "/emergency" },
  { label: "Trip packet", href: "/packet" },
  { label: "Trip settings", href: "/settings" },
];

export function TripTabBar({ base }: { base: string }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<null | "quick" | "more">(null);

  useEffect(() => {
    setSheet(null);
  }, [pathname]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  // Five slots: Home, People, the raised quick action, Tasks, More.
  // Schedule and every other section live one tap away in More.
  const leftTabs = [
    { key: "home", label: "Home", href: base },
    { key: "people", label: "People", href: `${base}/people` },
  ];
  const rightTabs = [{ key: "tasks", label: "Tasks", href: `${base}/tasks` }];

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  return (
    <>
      {sheet ? (
        <div
          className="fixed inset-0 z-40 bg-navy/40 lg:hidden"
          onClick={() => setSheet(null)}
          aria-hidden="true"
        />
      ) : null}

      {sheet ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={sheet === "quick" ? "Quick actions" : "More"}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-white pb-[calc(1rem+var(--safe-bottom))] lg:hidden animate-rise"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-3">
            <p className="font-display text-lg font-bold text-navy">
              {sheet === "quick" ? "Quick actions" : "More"}
            </p>
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-navy-soft"
            >
              Close
            </button>
          </div>
          <ul className="p-3">
            {(sheet === "quick" ? QUICK_ACTIONS : MORE_LINKS).map((item) => (
              <li key={item.href}>
                <Link
                  href={`${base}${item.href}`}
                  prefetch
                  className="flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-3 text-navy hover:bg-cream active:bg-cream-deep"
                >
                  {"icon" in item && typeof item.icon === "string" ? (
                    <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-green-soft text-green-deep">
                      <ActionIcon name={item.icon} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    {"hint" in item && typeof item.hint === "string" ? (
                      <span className="block text-xs text-navy-faint">{item.hint}</span>
                    ) : null}
                  </span>
                  <span aria-hidden="true" className="text-navy-faint">
                    &rsaquo;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav
        aria-label="Trip navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[var(--safe-bottom)] lg:hidden print-hide"
      >
        <ul className="mx-auto grid max-w-[512px] grid-cols-5 items-end">
          {leftTabs.map((tab) => (
            <li key={tab.key} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
                  isActive(tab.href) ? "text-green-brand" : "text-navy-faint"
                }`}
              >
                <TabIcon name={tab.key} active={isActive(tab.href)} />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          ))}

          <li className="flex min-w-0 justify-center">
            <button
              type="button"
              onClick={() => setSheet(sheet === "quick" ? null : "quick")}
              aria-label="Quick actions"
              aria-expanded={sheet === "quick"}
              className="-mt-[20px] flex h-[56px] w-[56px] items-center justify-center rounded-full bg-green-brand text-white shadow-lg shadow-green-brand/30"
            >
              <svg viewBox="0 0 24 24" className="h-[28px] w-[28px]" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </li>

          {rightTabs.map((tab) => (
            <li key={tab.key} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
                  isActive(tab.href) ? "text-green-brand" : "text-navy-faint"
                }`}
              >
                <TabIcon name={tab.key} active={isActive(tab.href)} />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          ))}

          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setSheet(sheet === "more" ? null : "more")}
              aria-expanded={sheet === "more"}
              className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${
                sheet === "more" ? "text-green-brand" : "text-navy-faint"
              }`}
            >
              <TabIcon name="more" active={sheet === "more"} />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
