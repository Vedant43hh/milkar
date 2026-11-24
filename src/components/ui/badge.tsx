import type { ReactNode } from "react";
import { cn } from "./cn";

// Badges are engraved (pressed in), so they read as labels, not buttons. The colour is never the
// only signal: every badge has a word.
const tones = {
  neutral: "text-muted",
  brand: "text-brand",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap neu-pressed-xs", tones[tone], className)}>
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
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-[box-shadow,color] duration-200 ease-in-out",
        selected ? "neu-pressed-sm font-medium text-brand" : "neu-raised-sm text-muted hover:text-fg hover:neu-raised-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}
