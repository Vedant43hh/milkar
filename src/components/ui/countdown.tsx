"use client";

import { Clock } from "lucide-react";
import { tu } from "@/i18n/ui";
import { formatIST, formatRemaining } from "@/lib/time";
import { cn } from "./cn";
import { useNow } from "./use-now";

/**
 * Live "closes in …" timer. Server HTML and first paint show the absolute IST time; once
 * hydrated it switches to a relative countdown that turns red in the last 3 hours.
 */
export function Countdown({ to, prefix, className }: { to: string; prefix?: string; className?: string }) {
  const target = new Date(to).getTime();
  const now = useNow();
  const left = now === null ? null : target - now;
  const urgent = left !== null && left > 0 && left < 3 * 3_600_000;
  const label =
    left === null
      ? `${prefix ?? tu("countdown.closes")} ${formatIST(new Date(target))}`
      : left <= 0
        ? tu("countdown.closed")
        : `${prefix ?? tu("countdown.closesIn")} ${formatRemaining(left)}`;

  return (
    <time dateTime={to} className={cn("inline-flex items-center gap-1 tabular-nums", urgent ? "font-medium text-danger" : "text-muted", className)}>
      <Clock aria-hidden className="size-3.5" />
      {label}
    </time>
  );
}
