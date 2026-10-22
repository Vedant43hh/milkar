import type { ReactNode } from "react";
import { cn } from "./cn";

/** `labelledBy`: the id of the card's title, which makes the section a named region for screen readers. */
export function Card({
  children,
  className,
  as: Tag = "section",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  labelledBy?: string;
}) {
  return (
    <Tag aria-labelledby={labelledBy} className={cn("rounded-card border border-border bg-surface p-4 shadow-card", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, titleId }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; titleId?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Page heading block used at the top of every screen. */
export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}
