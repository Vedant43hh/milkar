import {
  Building2,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  House,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Package,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Store,
  Truck,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Portal } from "@/lib/auth/rules";
import type { UiKey } from "@/i18n/ui";

export type NavItem = {
  href: string;
  label: UiKey;
  icon: LucideIcon;
  /** Not built yet: shown greyed out with a "Soon" badge. */
  soon?: boolean;
  /** Match only the exact path (for portal roots like "/app"). */
  exact?: boolean;
};

/** Each portal's navigation: bottom tabs for residents and technicians, a sidebar for the rest. */
export const PORTAL_NAV: Record<Portal, NavItem[]> = {
  app: [
    { href: "/app", label: "nav.home", icon: House, exact: true },
    { href: "/app/buys", label: "nav.buys", icon: ShoppingBasket },
    { href: "/app/orders", label: "nav.orders", icon: ReceiptText },
    { href: "/app/wallet", label: "nav.wallet", icon: Wallet },
  ],
  tech: [
    { href: "/tech", label: "nav.today", icon: Wrench, exact: true },
    { href: "/tech/upcoming", label: "nav.upcoming", icon: CalendarDays },
    { href: "/tech/me", label: "nav.me", icon: UserRound },
  ],
  manager: [
    { href: "/manager", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/manager/rounds", label: "nav.rounds", icon: ClipboardList },
    { href: "/manager/polls", label: "nav.polls", icon: Megaphone },
    { href: "/manager/residents", label: "nav.residents", icon: Users, soon: true },
    { href: "/manager/distribution", label: "nav.distribution", icon: Truck, soon: true },
    { href: "/manager/visits", label: "nav.visitDays", icon: ListChecks, soon: true },
  ],
  vendor: [
    { href: "/vendor", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/vendor/orders", label: "nav.vendorOrders", icon: Package, soon: true },
    { href: "/vendor/schedule", label: "nav.schedule", icon: CalendarClock, soon: true },
    { href: "/vendor/catalogue", label: "nav.catalogue", icon: Store, soon: true },
    { href: "/vendor/technicians", label: "nav.technicians", icon: Wrench, soon: true },
    { href: "/vendor/profile", label: "nav.profile", icon: UserRound, soon: true },
  ],
  admin: [
    { href: "/admin", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/communities", label: "nav.communities", icon: Building2, soon: true },
    { href: "/admin/vendors", label: "nav.vendors", icon: Store, soon: true },
    { href: "/admin/stats", label: "nav.stats", icon: ChartColumn, soon: true },
    { href: "/admin/settings", label: "nav.settings", icon: Settings, soon: true },
  ],
};

/** Portals used one-handed on phones get a bottom tab bar; the others a sidebar that becomes a drawer. */
export type TabPortal = "app" | "tech";
export type StaffPortal = "manager" | "vendor" | "admin";

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
