import {
  Building2,
  ClipboardList,
  House,
  LayoutDashboard,
  Megaphone,
  Package,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Sparkles,
  Store,
  Truck,
  UserRound,
  Users,
  Wallet,
  CalendarClock,
  ChartColumn,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/i18n";

export type NavItem = {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Not built yet: shown greyed out with a "Soon" badge. */
  soon?: boolean;
  /** Match only the exact path (for area roots like "/"). */
  exact?: boolean;
};

export const RESIDENT_NAV: NavItem[] = [
  { href: "/", label: "nav.home", icon: House, exact: true },
  { href: "/groceries", label: "nav.groceries", icon: ShoppingBasket },
  { href: "/services", label: "nav.services", icon: Sparkles },
  { href: "/orders", label: "nav.orders", icon: ReceiptText },
  { href: "/wallet", label: "nav.wallet", icon: Wallet },
];

export type StaffArea = "captain" | "vendor" | "admin";

export const STAFF_NAV: Record<StaffArea, NavItem[]> = {
  captain: [
    { href: "/captain", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/captain/rounds", label: "nav.rounds", icon: ClipboardList },
    { href: "/captain/polls", label: "nav.polls", icon: Megaphone },
    { href: "/captain/distribution", label: "nav.distribution", icon: Truck, soon: true },
    { href: "/captain/residents", label: "nav.residents", icon: Users, soon: true },
  ],
  vendor: [
    { href: "/vendor", label: "nav.overview", icon: LayoutDashboard, exact: true },
    { href: "/vendor/orders", label: "nav.vendorOrders", icon: Package, soon: true },
    { href: "/vendor/schedule", label: "nav.schedule", icon: CalendarClock, soon: true },
    { href: "/vendor/catalogue", label: "nav.catalogue", icon: Store, soon: true },
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

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
