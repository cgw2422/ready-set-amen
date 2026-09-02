import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const variantClass: Record<Variant, string> = {
  primary: "bg-green-brand text-white hover:bg-green-deep active:bg-green-deep",
  secondary: "bg-white text-navy border border-line hover:bg-cream",
  ghost: "bg-transparent text-navy-soft hover:bg-cream-deep",
  danger: "bg-coral text-white hover:bg-coral-deep",
  gold: "bg-gold text-navy hover:bg-gold-deep hover:text-white",
};

const sizeClass = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2.5 text-[15px] rounded-xl min-h-[44px]",
  lg: "px-6 py-3.5 text-base rounded-xl min-h-[52px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizeClass }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizeClass }) {
  return (
    <Link
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <Tag className={`rounded-2xl border border-line bg-white ${className}`}>{children}</Tag>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold text-navy">{title}</h2>
        {description ? <p className="mt-1 text-sm text-navy-soft">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "green" | "coral" | "gold" | "navy" | "muted";

const toneClass: Record<Tone, string> = {
  green: "bg-green-soft text-green-deep",
  coral: "bg-coral-soft text-coral-deep",
  gold: "bg-gold-soft text-gold-deep",
  navy: "bg-navy text-white",
  muted: "bg-cream-deep text-navy-soft",
};

export function Badge({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-navy">
        {label}
        {required ? <span className="ml-1 text-coral">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-navy-faint">{hint}</span> : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-navy placeholder:text-navy-faint focus:border-green-brand focus:outline-none focus:ring-2 focus:ring-green-brand/25 min-h-[44px]";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${controlClass} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${controlClass} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${controlClass} ${className}`} />;
}

export function Checkbox({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      {...props}
      className={`h-5 w-5 shrink-0 rounded border-2 border-navy-faint text-green-brand accent-[#106b4d] focus:ring-2 focus:ring-green-brand/40 ${className}`}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      {icon ? <div className="mb-3 flex justify-center text-green-brand">{icon}</div> : null}
      <p className="font-display text-lg font-bold text-navy">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-navy-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
  title,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  title?: string;
}) {
  const cls = {
    info: "bg-green-tint border-green-soft text-navy",
    success: "bg-green-soft border-green-brand/30 text-green-deep",
    warning: "bg-gold-soft border-gold/40 text-navy",
    error: "bg-coral-soft border-coral/40 text-coral-deep",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

/** Circular readiness gauge used on the trip dashboard. */
export function ProgressRing({
  percent,
  size = 96,
  label,
}: {
  percent: number;
  size?: number;
  label?: string;
}) {
  const stroke = size >= 90 ? 9 : 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label ?? `${clamped}% ready`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-cream-deep)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={clamped >= 100 ? "var(--color-green-brand)" : "var(--color-gold)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-extrabold leading-none text-navy">{clamped}%</span>
      </div>
    </div>
  );
}

export function ProgressBar({ percent, tone = "green" }: { percent: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = {
    green: "bg-green-brand",
    coral: "bg-coral",
    gold: "bg-gold",
    navy: "bg-navy",
    muted: "bg-navy-faint",
  }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cream-deep">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
