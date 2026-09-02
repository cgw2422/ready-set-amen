"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function OrgMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-navy"
      >
        <span className="sr-only">Menu</span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-lg"
        >
          <Link href={`/orgs/${slug}`} className="block px-4 py-3 text-sm hover:bg-cream" role="menuitem">
            Trips
          </Link>
          <Link
            href={`/orgs/${slug}/waivers`}
            className="block px-4 py-3 text-sm hover:bg-cream"
            role="menuitem"
          >
            Waiver library
          </Link>
          <Link
            href={`/orgs/${slug}/settings`}
            className="block px-4 py-3 text-sm hover:bg-cream"
            role="menuitem"
          >
            Organization settings
          </Link>
          <Link href="/orgs" className="block px-4 py-3 text-sm hover:bg-cream" role="menuitem">
            Switch organization
          </Link>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="w-full border-t border-line px-4 py-3 text-left text-sm text-coral-deep hover:bg-cream"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
