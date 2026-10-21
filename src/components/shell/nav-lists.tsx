// Navigation lists with no hooks, so they render on the server as the Suspense fallback and in
// the browser via the active-path wrappers in nav-active.tsx.
import Link from "next/link";
import { tu } from "@/i18n/ui";
import { cn } from "../ui/cn";
import { isActive, PORTAL_NAV, type NavItem, type TabPortal } from "./nav-config";

const COLUMNS: Record<number, string> = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

/** Bottom tab bar on phones (residents and technicians). Technicians get taller, one-thumb targets. */
export function TabList({ portal, pathname }: { portal: TabPortal; pathname: string }) {
  const items = PORTAL_NAV[portal];
  const tall = portal === "tech";
  return (
    <nav
      aria-label={tu("nav.main")}
      className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur", portal === "app" && "md:hidden")}
    >
      <ul className={cn("mx-auto grid max-w-md", COLUMNS[items.length])}>
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 transition-colors",
                  tall ? "min-h-16 text-xs" : "min-h-14 text-[0.7rem]",
                  active ? "font-semibold text-brand" : "text-muted hover:text-fg",
                )}
              >
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />}
                <Icon aria-hidden className={cn(tall ? "size-6" : "size-5", active && "stroke-[2.5]")} />
                {tu(item.label)}
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
        {tu(item.label)}
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-muted uppercase">{tu("ui.soon")}</span>
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
      {tu(item.label)}
    </Link>
  );
}

/** Vertical list for a sidebar (staff portals, and residents on wide screens). */
export function SideNavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label={tu("nav.main")}>
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
