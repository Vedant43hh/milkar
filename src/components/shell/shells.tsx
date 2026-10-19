import { Bell, Building2, Menu } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { unreadCount } from "@/server/notifications";
import { InlineSkeleton } from "../ui/skeleton";
import { Sheet } from "../ui/sheet";
import { AccountMenu, ThemeMenu } from "./account-menu";
import { Logo } from "./logo";
import { ActiveResidentSideNav, ActiveResidentTabBar, ActiveStaffNav } from "./nav-active";
import { RESIDENT_NAV, STAFF_NAV, type StaffArea } from "./nav-config";
import { ResidentTabList, SideNavList } from "./nav-lists";

// Layout shells. They are static; anything that depends on the signed-in user is a small
// <Suspense> island, so the frame renders instantly and the islands stream in.

async function CommunityName() {
  const user = await getCurrentUser();
  if (!user?.flat) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg">
      <Building2 aria-hidden className="size-4 shrink-0 text-brand" />
      <span className="truncate">{user.flat.community.name}</span>
    </span>
  );
}

function BellLink({ href, count }: { href: string; count: number }) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? t("notifications.bellUnread", { n: count }) : t("notifications.bell")}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Bell aria-hidden className="size-5" />
      {count > 0 && (
        <span
          aria-hidden
          data-testid="unread-badge"
          className="absolute top-1.5 right-1.5 flex h-4.5 min-w-4.5 animate-pop items-center justify-center rounded-full bg-danger px-1 text-[0.65rem] leading-none font-bold text-white ring-2 ring-surface dark:text-surface"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/** The bell with the signed-in user's unread count. Reads the session: render inside <Suspense>. */
async function UnreadBell({ href }: { href: string }) {
  const user = await getCurrentUser();
  return <BellLink href={href} count={user ? await unreadCount(user.id) : 0} />;
}

function NotificationBell({ href }: { href: string }) {
  return (
    <Suspense fallback={<BellLink href={href} count={0} />}>
      <UnreadBell href={href} />
    </Suspense>
  );
}

export function ResidentShell({ children }: { children: ReactNode }) {
  return (
    <div className="md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:gap-4 md:border-r md:border-border md:bg-surface md:px-3 md:py-3">
        <div className="px-2">
          <Logo />
        </div>
        <Suspense fallback={<SideNavList items={RESIDENT_NAV} pathname="" />}>
          <ActiveResidentSideNav />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3 md:px-6">
            <span className="md:hidden">
              <Logo />
            </span>
            <span className="hidden min-w-0 md:block">
              <Suspense fallback={<InlineSkeleton />}>
                <CommunityName />
              </Suspense>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell href="/notifications" />
              <Suspense fallback={<span className="size-11" />}>
                <AccountMenu context="resident" />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl animate-fade-in px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-12">{children}</main>
      </div>
      <Suspense fallback={<ResidentTabList pathname="" />}>
        <ActiveResidentTabBar />
      </Suspense>
    </div>
  );
}

const AREA_TITLES: Record<StaffArea, "areas.captainTitle" | "areas.vendorTitle" | "areas.adminTitle"> = {
  captain: "areas.captainTitle",
  vendor: "areas.vendorTitle",
  admin: "areas.adminTitle",
};

/** Captains are residents, so their notifications live in the resident app. */
const NOTIFICATIONS_PATH: Record<StaffArea, string> = {
  captain: "/notifications",
  vendor: "/vendor/notifications",
  admin: "/admin/notifications",
};

export function StaffShell({ area, children }: { area: StaffArea; children: ReactNode }) {
  const nav = (
    <Suspense fallback={<SideNavList items={STAFF_NAV[area]} pathname="" />}>
      <ActiveStaffNav area={area} />
    </Suspense>
  );
  return (
    <div className="md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:gap-4 md:border-r md:border-border md:bg-surface md:px-3 md:py-3">
        <div className="px-2">
          <Logo href={`/${area}`} />
          <p className="mt-1 px-1 text-xs font-medium tracking-wide text-muted uppercase">{t(AREA_TITLES[area])}</p>
        </div>
        {nav}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 md:px-6">
            <span className="md:hidden">
              <Sheet title={t(AREA_TITLES[area])} triggerLabel={t("common.menu")} trigger={<Menu aria-hidden className="size-5" />}>
                {nav}
              </Sheet>
            </span>
            <span className="font-semibold md:hidden">{t(AREA_TITLES[area])}</span>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell href={NOTIFICATIONS_PATH[area]} />
              <Suspense fallback={<span className="size-11" />}>
                <AccountMenu context="staff" />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl animate-fade-in px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}

/** Login and join pages: logo, account or theme menu, one narrow column. */
export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const width = wide ? "max-w-4xl" : "max-w-md";
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between px-3`}>
          <Logo />
          <Suspense fallback={<ThemeMenu />}>
            <AccountMenu context="public" />
          </Suspense>
        </div>
      </header>
      <main className={`mx-auto ${width} animate-fade-in px-4 py-8`}>{children}</main>
    </div>
  );
}
