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
      className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]", portal === "app" && "md:hidden")}
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
                  "flex flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                  tall ? "min-h-16" : "min-h-14",
                  active ? "font-medium text-accent" : "text-muted hover:text-fg",
                )}
              >
                <Icon aria-hidden className={tall ? "size-6" : "size-5"} />
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
  const classes = "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors";
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(classes, active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-hover hover:text-fg")}
    >
      <Icon aria-hidden className="size-4.5" />
      {tu(item.label)}
    </Link>
  );
}

/** Vertical list for a sidebar (staff portals, and residents on wide screens). */
export function SideNavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav aria-label={tu("nav.main")}>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <SideItem item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
