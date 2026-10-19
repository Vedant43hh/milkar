import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand-soft-fg",
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Rounded pill for filters and categories. Renders as a span; wrap in a link or button for interaction. */
export function Chip({ selected, children, className }: { selected?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
        selected ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border bg-surface text-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </span>
  );
}
