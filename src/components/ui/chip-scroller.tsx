import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A row of chips you can swipe sideways on a phone (scroll-snap, no JavaScript). It bleeds to the
 * screen edges inside the page padding, so it never makes the page itself scroll sideways. The
 * chips should be links or buttons: keyboard users then scroll the row by tabbing through them.
 */
export function ChipScroller({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:snap-start",
        className,
      )}
    >
      {children}
    </div>
  );
}
