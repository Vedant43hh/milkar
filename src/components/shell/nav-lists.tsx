// Navigation lists with no hooks, so they render on the server as the Suspense fallback and in
// the browser via the active-path wrappers in nav-active.tsx.
import Link from "next/link";
import { t } from "@/i18n";
import { cn } from "../ui/cn";
import { isActive, RESIDENT_NAV, type NavItem } from "./nav-config";

/** Bottom tab bar on phones. */
export function ResidentTabList({ pathname }: { pathname: string }) {
  return (
    <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {RESIDENT_NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] transition-colors", active ? "font-semibold text-brand" : "text-muted hover:text-fg")}
              >
                <Icon aria-hidden className={cn("size-5", active && "stroke-[2.5]")} />
                {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const classes = "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm";
  if (item.soon) {
    return (
      <span aria-disabled className={cn(classes, "cursor-default text-subtle")}>
        <Icon aria-hidden className="size-5" />
        {t(item.label)}
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted uppercase">{t("common.soon")}</span>
      </span>
    );
  }
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(classes, "transition-colors", active ? "bg-brand-soft font-semibold text-brand-soft-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
    >
      <Icon aria-hidden className="size-5" />
      {t(item.label)}
    </Link>
  );
}

/** Vertical list for the desktop sidebar (residents) or any staff area. */
export function SideNavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label={t("nav.main")}>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <SideItem item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
