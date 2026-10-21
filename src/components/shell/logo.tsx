import Link from "next/link";
import { t } from "@/i18n";

/** Wordmark: a two-circle "together" mark plus the name. `compact` shows the mark alone (narrow headers). */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex min-h-11 min-w-11 items-center gap-2 font-semibold tracking-tight text-fg">
      <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
        <circle cx="12" cy="16" r="9" className="fill-brand" />
        <circle cx="20" cy="16" r="9" className="fill-accent" opacity="0.9" />
      </svg>
      <span className={compact ? "sr-only" : "text-lg"}>{t("app.name")}</span>
    </Link>
  );
}
