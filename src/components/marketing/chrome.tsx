"use client";

import { useState } from "react";
import { CheckBadge } from "@/components/brand";

/**
 * Public site header. The links are in-page anchors — this is one landing page,
 * not a small site — and the two calls to action point at the application,
 * which lives on its own hostname in production.
 */
const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#waivers", label: "Waivers" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader({ loginUrl, signupUrl }: { loginUrl: string; signupUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-4">
        <a href="#top" className="inline-flex min-h-[44px] shrink-0 items-center gap-2">
          <CheckBadge />
          <span className="font-display text-base font-extrabold uppercase tracking-tight text-green-brand sm:text-lg">
            Ready<span className="text-coral" aria-hidden="true">.</span>Set
            <span className="text-gold" aria-hidden="true">.</span>Amen
            <span className="text-coral" aria-hidden="true">.</span>
          </span>
          <span className="sr-only">Ready Set Amen home</span>
        </a>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-navy-soft hover:bg-cream-deep hover:text-navy"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 lg:ml-0">
          <a
            href={loginUrl}
            className="hidden min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-navy hover:bg-cream-deep sm:inline-flex"
          >
            Log In
          </a>
          <a
            href={signupUrl}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-green-brand px-3 text-[13px] font-bold text-white hover:bg-green-deep sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">Start Free</span>
            <span className="hidden sm:inline">Start Planning Free</span>
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-navy lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              {open ? (
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="site-menu" aria-label="Main" className="border-t border-line/70 bg-cream px-4 pb-4 lg:hidden">
          <ul className="pt-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center rounded-lg px-2 font-semibold text-navy hover:bg-cream-deep"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={loginUrl}
                className="flex min-h-[48px] items-center rounded-lg px-2 font-semibold text-navy hover:bg-cream-deep"
              >
                Log In
              </a>
            </li>
          </ul>
          <a
            href={signupUrl}
            className="mt-2 flex min-h-[52px] items-center justify-center rounded-xl bg-green-brand px-4 font-bold text-white"
          >
            Start Planning Free
          </a>
        </nav>
      ) : null}
    </header>
  );
}
