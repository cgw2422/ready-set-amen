/** Clean line icons for the feature grid. Decorative; each card has a heading. */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  className: "h-7 w-7",
  "aria-hidden": true as const,
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  people: () => (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.4a3.2 3.2 0 0 1 0 6.2M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </svg>
  ),
  waiver: () => (
    <svg {...base}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </svg>
  ),
  payment: () => (
    <svg {...base}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18M6.5 14.5h3" />
    </svg>
  ),
  van: () => (
    <svg {...base}>
      <path d="M3 16V9a2 2 0 0 1 2-2h9l4 4h2a2 2 0 0 1 2 2v3h-2" />
      <path d="M3 16h2M10 16h5" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="17.5" cy="16.5" r="2" />
    </svg>
  ),
  lodging: () => (
    <svg {...base}>
      <path d="M3 18V8l9-4 9 4v10" />
      <path d="M8 18v-5h8v5M3 18h18" />
    </svg>
  ),
  schedule: () => (
    <svg {...base}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5l2 2 4-4" />
    </svg>
  ),
  headcount: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 11 15.5l5-6" />
    </svg>
  ),
  prayer: () => (
    <svg {...base}>
      <path d="M12 21V9M12 9 9.2 5.6a1.6 1.6 0 0 0-2.7 1.7L8.6 13l-2.3 1.4a1.8 1.8 0 0 0-.7 2.2L6.7 21M12 9l2.8-3.4a1.6 1.6 0 0 1 2.7 1.7L15.4 13l2.3 1.4a1.8 1.8 0 0 1 .7 2.2L17.3 21" />
    </svg>
  ),
  shield: () => (
    <svg {...base}>
      <path d="M12 3l7 3v5.5c0 4.3-3 8-7 9.5-4-1.5-7-5.2-7-9.5V6z" />
      <path d="M9 12.2l2.2 2.3L15.5 10" />
    </svg>
  ),
  church: () => (
    <svg {...base}>
      <path d="M12 2.5v4M10 4.5h4M5 21v-9l7-4 7 4v9" />
      <path d="M3 21h18M10 21v-4.5h4V21" />
    </svg>
  ),
};
