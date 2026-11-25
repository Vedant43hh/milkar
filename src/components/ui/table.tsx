import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Tables: a bordered white container, a header row, and rows split by thin dividers. Scrolls
// sideways on narrow screens instead of squeezing the columns.

export function Table({ children, className, caption }: { children: ReactNode; className?: string; caption?: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-card border border-border bg-surface", className)}>
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border bg-bg text-muted">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("px-4 py-2 font-medium whitespace-nowrap", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-2.5 align-top text-fg", className)} {...props} />;
}
