"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Five thumb-reachable targets (docs/ARCHITECTURE.md §7). The raised centre
 * button opens the things a leader needs while standing beside a van.
 */
const QUICK_ACTIONS = [
  { label: "Start a headcount", href: "/headcount", hint: "Count everyone in under a minute" },
  { label: "Emergency info", href: "/emergency", hint: "Contacts, allergies, medications" },
  { label: "Add an attendee", href: "/people/new", hint: "One person, right now" },
  { label: "Waiver links", href: "/waivers", hint: "Copy links for anyone unsigned" },
  { label: "Add to the schedule", href: "/itinerary", hint: "Keep the day on track" },
];

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = { stroke, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path d="M3.5 11 12 4l8.5 7" {...common} />
          <path d="M5.5 9.6V20h13V9.6" {...common} />
        </svg>
      );
    case "people":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" {...common} />
          <path d="M3.5 19.5c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5" {...common} />
          <path d="M16 6.2a3 3 0 0 1 0 5.6M17 14.8c2 .5 3.4 2.2 3.8 4.7" {...common} />
        </svg>
      );
    case "schedule":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...common} />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...common} />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" {...common} />
          <path d="M8.5 12.2l2.4 2.4 4.6-5" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
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
                  className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl px-3 py-3 text-navy hover:bg-cream"
                >
                  <span>
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
        <ul className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {leftTabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${
                  isActive(tab.href) ? "text-green-brand" : "text-navy-faint"
                }`}
              >
                <TabIcon name={tab.key} active={isActive(tab.href)} />
                {tab.label}
              </Link>
            </li>
          ))}

          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => setSheet(sheet === "quick" ? null : "quick")}
              aria-label="Quick actions"
              aria-expanded={sheet === "quick"}
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-brand text-white shadow-lg shadow-green-brand/30"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </li>

          {rightTabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${
                  isActive(tab.href) ? "text-green-brand" : "text-navy-faint"
                }`}
              >
                <TabIcon name={tab.key} active={isActive(tab.href)} />
                {tab.label}
              </Link>
            </li>
          ))}

          <li>
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
