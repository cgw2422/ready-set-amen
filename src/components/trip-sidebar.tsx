"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    heading: "Trip",
    links: [
      { label: "Dashboard", href: "" },
      { label: "People", href: "/people" },
      { label: "Schedule", href: "/itinerary" },
      { label: "Tasks", href: "/tasks" },
      { label: "Prayer", href: "/prayer" },
    ],
  },
  {
    heading: "Paperwork",
    links: [
      { label: "Waivers", href: "/waivers" },
      { label: "Forms", href: "/forms" },
      { label: "Payments", href: "/payments" },
    ],
  },
  {
    heading: "Logistics",
    links: [
      { label: "Transportation", href: "/transportation" },
      { label: "Lodging", href: "/lodging" },
      { label: "Leaders", href: "/leaders" },
    ],
  },
  {
    heading: "On the road",
    links: [
      { label: "Headcount", href: "/headcount" },
      { label: "Emergency info", href: "/emergency" },
      { label: "Trip packet", href: "/packet" },
      { label: "Trip settings", href: "/settings" },
    ],
  },
];

/** Desktop/tablet replacement for the mobile tab bar. Same destinations. */
export function TripSidebar({ base }: { base: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Trip sections"
      className="sticky top-[73px] hidden h-[calc(100dvh-73px)] w-56 shrink-0 overflow-y-auto py-6 lg:block print-hide"
    >
      {SECTIONS.map((section) => (
        <div key={section.heading} className="mb-5">
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-navy-faint">
            {section.heading}
          </p>
          <ul>
            {section.links.map((link) => {
              const href = `${base}${link.href}`;
              const active = link.href === "" ? pathname === base : pathname.startsWith(href);
              return (
                <li key={link.label}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-semibold ${
                      active ? "bg-green-soft text-green-deep" : "text-navy-soft hover:bg-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
