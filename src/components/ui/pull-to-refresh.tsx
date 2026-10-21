"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { tu } from "@/i18n/ui";
import { cn } from "./cn";

const THRESHOLD = 72;

/**
 * Pull down at the top of a list on a phone to refetch the page's server data. A light touch
 * handler, no library; mouse and keyboard users get the data the usual way (navigation, refresh).
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const start = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    start.current = window.scrollY === 0 ? e.touches[0].clientY : null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (start.current === null) return;
    const distance = e.touches[0].clientY - start.current;
    setPull(distance > 0 ? Math.min(distance * 0.5, THRESHOLD * 1.4) : 0);
  }
  function onTouchEnd() {
    if (pull >= THRESHOLD) startRefresh(() => router.refresh());
    start.current = null;
    setPull(0);
  }

  const visible = pull > 8 || refreshing;
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div
        aria-live="polite"
        className={cn("flex items-center justify-center gap-2 overflow-hidden text-xs text-muted transition-[height]", visible ? "h-10" : "h-0")}
      >
        {visible && (
          <>
            <RefreshCw aria-hidden className={cn("size-4", refreshing && "animate-spin")} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
            {refreshing ? tu("refresh.refreshing") : pull >= THRESHOLD ? tu("refresh.release") : tu("refresh.pull")}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
