import Link from "next/link";

/** The stacked READY. SET. AMEN. wordmark. */
export function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = {
    sm: "text-base px-2 py-0.5",
    md: "text-2xl px-3 py-1",
    lg: "text-4xl sm:text-5xl px-4 py-1.5",
  }[size];

  return (
    <span className={`inline-flex flex-col items-start gap-1 font-display font-extrabold uppercase leading-none ${className}`}>
      <span className={`bg-green-brand text-cream ${scale} -rotate-2 rounded-sm`}>Ready.</span>
      <span className={`bg-coral text-white ${scale} rotate-1 rounded-sm`}>Set.</span>
      <span className={`bg-gold text-navy ${scale} -rotate-1 rounded-sm`}>Amen.</span>
    </span>
  );
}

/** Single-line lockup for headers and nav. */
export function LogoLockup({
  href = "/",
  subtle = false,
  /** Renders the mark without a link — used on the public signing page. */
  static: isStatic = false,
}: {
  href?: string;
  subtle?: boolean;
  static?: boolean;
}) {
  const Wrapper = isStatic
    ? ({ children }: { children: React.ReactNode }) => (
        <span className="inline-flex items-center gap-2">{children}</span>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <Link href={href} className="inline-flex min-h-[44px] items-center gap-2">
          {children}
        </Link>
      );

  return (
    <Wrapper>
      <CheckBadge />
      <span
        className={`font-display text-lg font-extrabold uppercase tracking-tight ${
          subtle ? "text-navy" : "text-green-brand"
        }`}
      >
        {/* The punctuation is part of the logotype, which WCAG exempts from
            contrast requirements; it is decorative and never load-bearing. */}
        Ready<span className="text-coral" aria-hidden="true">.</span>Set
        <span className="text-gold" aria-hidden="true">.</span>Amen
        <span className="text-coral" aria-hidden="true">.</span>
      </span>
    </Wrapper>
  );
}

export function CheckBadge({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-navy text-white ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
        <path
          d="M5 12.5 10 17.5 19 7"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** The confetti burst used on success moments. Purely decorative. */
export function Confetti({ className = "" }: { className?: string }) {
  const marks = [
    { x: 8, y: 30, r: -25, c: "var(--color-coral)" },
    { x: 20, y: 12, r: 15, c: "var(--color-gold)" },
    { x: 34, y: 24, r: -10, c: "var(--color-green-brand)" },
    { x: 66, y: 20, r: 20, c: "var(--color-coral)" },
    { x: 80, y: 34, r: -18, c: "var(--color-gold)" },
    { x: 92, y: 16, r: 8, c: "var(--color-green-brand)" },
  ];
  return (
    <svg viewBox="0 0 100 50" className={className} aria-hidden="true">
      {marks.map((m, i) => (
        <rect
          key={i}
          x={m.x}
          y={m.y}
          width="7"
          height="2.6"
          rx="1.3"
          fill={m.c}
          transform={`rotate(${m.r} ${m.x + 3.5} ${m.y + 1.3})`}
        />
      ))}
    </svg>
  );
}
