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
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
      {showMrp && (
        <span className="text-xs text-subtle tabular-nums">
          <span className="sr-only">{tu("price.mrp")} </span>
          <s>{formatINR(mrpPaise)}</s>
        </span>
      )}
    </span>
  );
}

export function Stat({ label, value, hint, icon, tone = "neutral" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "neutral" | "accent" | "brand" | "success" }) {
  const iconTone = { neutral: "bg-surface-2 text-muted", accent: "bg-accent-soft text-accent-soft-fg", brand: "bg-brand-soft text-brand-soft-fg", success: "bg-success-soft text-success" }[tone];
  return (
    <div className="flex items-center gap-3">
      {icon && <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", iconTone)}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-semibold text-fg tabular-nums">{value}</p>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
    </div>
  );
}

/** A tappable row for lists: icon, title, subtitle and a trailing element or chevron. */
export function ListRow({
  href,
  icon,
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
      {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing ?? (href && <ChevronRight aria-hidden className="size-5 text-subtle" />)}
    </>
  );
  const classes = "flex min-h-14 items-center gap-3 px-4 py-3";
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

const bannerTones = {
  info: "border-brand/30 bg-brand-soft text-brand-soft-fg",
  accent: "border-accent/40 bg-accent-soft text-accent-soft-fg",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
} as const;

export function Banner({
  tone = "info",
  icon,
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
    <div role={role} className={cn("flex gap-3 rounded-control border p-3 text-sm", bannerTones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      {icon && <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">{icon}</span>}
      <p className="font-semibold text-fg">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
