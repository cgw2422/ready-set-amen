"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui";

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "minors", label: "Minors" },
  { value: "leaders", label: "Leaders" },
  { value: "unsigned", label: "Waiver needed" },
  { value: "missing-emergency", label: "No emergency contact" },
  { value: "no-guardian", label: "No guardian" },
  { value: "no-vehicle", label: "No vehicle" },
  { value: "no-room", label: "No room" },
  { value: "owing", label: "Owes money" },
];

export function PeopleFilters({
  basePath,
  q,
  filter,
}: {
  basePath: string;
  q: string;
  filter: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [, startTransition] = useTransition();

  const push = (nextQ: string, nextFilter: string) => {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextFilter !== "all") params.set("filter", nextFilter);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${basePath}?${query}` : basePath));
  };

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={value}
        placeholder="Search by name"
        aria-label="Search people"
        onChange={(e) => {
          setValue(e.currentTarget.value);
          push(e.currentTarget.value, filter);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => push(value, f.value)}
            className={`shrink-0 min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-semibold ${
              filter === f.value
                ? "border-green-brand bg-green-brand text-white"
                : "border-line bg-white text-navy-soft"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
