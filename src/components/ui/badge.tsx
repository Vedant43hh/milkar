import type { ReactNode } from "react";
import { cn } from "./cn";

// Status badges: a tinted background with dark text, no border, no icon. Green is done or paid,
// amber is waiting, red is a problem, blue is information. Every badge says what it means in words.
const tones = {
  neutral: "bg-neutral-soft text-neutral",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export type Tone = keyof typeof tones;

/** `icon` is accepted for older call sites and not shown: badges are text only. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-control px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/** Filter or category choice. Renders as a span; wrap it in a link or button for interaction. */
export function Chip({ selected, children, className }: { selected?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3 text-sm whitespace-nowrap transition-colors",
        selected ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface text-fg hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </span>
  );
}
