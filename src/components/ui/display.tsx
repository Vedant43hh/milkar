import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { tu } from "@/i18n/ui";
import { formatINR } from "@/lib/pricing/money";
import { cn } from "./cn";

/** Rupee price with the MRP struck through when it is higher. */
export function Price({ paise, mrpPaise, size = "md", suffix }: { paise: number; mrpPaise?: number; size?: "sm" | "md" | "lg"; suffix?: ReactNode }) {
  const showMrp = mrpPaise !== undefined && mrpPaise > paise;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className={cn("font-semibold text-fg tabular-nums", { sm: "text-sm", md: "text-base", lg: "text-xl" }[size])}>{formatINR(paise)}</span>
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
      {showMrp && (
        <span className="text-sm text-muted tabular-nums">
          <span className="sr-only">{tu("price.mrp")} </span>
          <s>{formatINR(mrpPaise)}</s>
        </span>
      )}
    </span>
  );
}

/** One figure: a label, the value, and an optional note. Put several in a grid inside a Card. */
export function StatCard({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-semibold text-fg tabular-nums">{value}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Older name for StatCard. `icon` and `tone` are accepted from older call sites and not shown. */
export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string }) {
  return <StatCard label={label} value={value} hint={hint} />;
}

/** A bordered list with thin dividers between rows. */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-border overflow-hidden rounded-card border border-border bg-surface", className)}>
      {children}
    </ul>
  );
}

/** A row for a List: title, subtitle and a trailing element (a chevron when it links somewhere). `icon` is accepted and not shown. */
export function ListRow({
  href,
  title,
  subtitle,
  trailing,
}: {
  href?: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing ?? (href && <ChevronRight aria-hidden className="size-4 text-muted" />)}
    </>
  );
  const classes = "flex min-h-12 items-center gap-3 px-4 py-2.5";
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors hover:bg-surface-hover")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

// A tinted status box with dark text. The words carry the meaning; the colour only supports it.
const bannerTones = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
} as const;

/** `icon` is accepted from older call sites and not shown. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  role,
}: {
  tone?: keyof typeof bannerTones;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("flex flex-wrap items-center gap-3 rounded-control px-4 py-3 text-sm", bannerTones[tone])}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Nothing to show yet: one short sentence, a note if needed, and a button when there is something to do. */
export function EmptyState({ title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-6">
      <p className="text-sm font-medium text-fg">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
