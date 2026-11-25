import Link from "next/link";
import { t } from "@/i18n";

/**
 * The Milkar mark: two overlapping circles, dark and light green, where neighbours meet. The
 * overlap is drawn as its own lens shape (no blending), in the logo colours from globals.css.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 38 26" className={className}>
      <circle cx="13" cy="13" r="12" fill="var(--logo-dark)" />
      <circle cx="25" cy="13" r="12" fill="var(--logo-light)" />
      <path d="M19 2.608A12 12 0 0 1 19 23.392A12 12 0 0 1 19 2.608Z" fill="var(--logo-overlap)" />
    </svg>
  );
}

/** Wordmark: the mark and the name. `compact` shows the mark alone (narrow headers). */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-control text-fg">
      <LogoMark className="h-6 w-auto shrink-0" />
      <span className={compact ? "sr-only" : "text-xl font-semibold"}>{t("app.name")}</span>
    </Link>
  );
}
