import { Bell, Menu } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { messages, t, type MessageKey } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEnter, PORTAL_PATH, type Portal } from "@/lib/auth/rules";
import { unreadCount } from "@/server/notifications";
import { OnboardingTour } from "../onboarding/tour";
import { cn } from "../ui/cn";
import { InlineSkeleton } from "../ui/skeleton";
import { Sheet } from "../ui/sheet";
import { AccountMenu } from "./account-menu";
import { Logo } from "./logo";
import { ActiveSideNav, ActiveTabBar } from "./nav-active";
import { PORTAL_NAV, type StaffPortal, type TabPortal } from "./nav-config";
import { SideNavList, TabList } from "./nav-lists";

// Layout shells: a Navbar on top, a Sidebar on wide screens (a drawer or a bottom tab bar on
// phones). They are static; anything that depends on the signed-in user is a small <Suspense>
// island, so the frame renders instantly and the islands stream in. data-portal marks which
// portal a page belongs to (used by the wrong-portal page, see globals.css).

export const PORTAL_NAME: Record<Portal, MessageKey> = {
  app: "portals.app",
  manager: "portals.manager",
  vendor: "portals.vendor",
  tech: "portals.tech",
  admin: "portals.admin",
};

/** The portal's name in plain text, so people always know which area they're in. */
function PortalName({ portal }: { portal: Portal }) {
  return <span className="text-sm font-medium text-muted">{t(PORTAL_NAME[portal])}</span>;
}

/** Whose space this is: the resident's community, the community a manager runs, or the vendor. */
async function ContextName({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  if (!user || !canEnter(user, portal)) return null;
  const community = portal === "app" ? user.flat?.community : portal === "manager" ? user.staff?.community : undefined;
  const name = community?.name ?? (portal === "vendor" || portal === "tech" ? user.vendor?.name : undefined);
  if (!name) return null;
  return <span className="block truncate text-sm font-medium text-fg">{name}</span>;
}

function BellLink({ href, count }: { href: string; count: number }) {
  // The label uses the same number the badge shows ("9+"), so the visible text is part of the name.
  const shown = count > 9 ? "9+" : String(count);
  return (
    <Link
      href={href}
      aria-label={count > 0 ? t("notifications.bellUnread", { n: shown }) : t("notifications.bell")}
      className="relative inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <Bell aria-hidden className="size-5" />
      {count > 0 && (
        <span
          aria-hidden
          data-testid="unread-badge"
          className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-none font-semibold text-accent-fg"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}

/** The bell with the signed-in user's unread count. Reads the session: render inside <Suspense>. */
async function UnreadBell({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  if (!user || !canEnter(user, portal)) return null;
  return <BellLink href={`${PORTAL_PATH[portal]}/notifications`} count={await unreadCount(user.id)} />;
}

function NotificationBell({ portal }: { portal: Portal }) {
  return (
    <Suspense fallback={<BellLink href={`${PORTAL_PATH[portal]}/notifications`} count={0} />}>
      <UnreadBell portal={portal} />
    </Suspense>
  );
}

/**
 * Navigation only for people of this portal's role. Anyone else is looking at the friendly
 * "this area is for …" page and gets no links into it. The static fallback is the full nav, so
 * the people who belong here see it at once.
 */
async function OwnersOnly({ portal, children }: { portal: Portal; children: ReactNode }) {
  const user = await getCurrentUser();
  return user && canEnter(user, portal) ? children : null;
}

function PortalNav({ portal, fallback, children }: { portal: Portal; fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <OwnersOnly portal={portal}>{children}</OwnersOnly>
    </Suspense>
  );
}

function Account({ portal }: { portal: Portal }) {
  return (
    <Suspense fallback={<span className="size-11" />}>
      <AccountMenu portal={portal} />
    </Suspense>
  );
}

/**
 * The first-login tour, for an account that is set up for this portal and hasn't seen it yet
 * (not while a resident or a community is still waiting for approval).
 */
async function FirstLoginTour({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  if (!user || !canEnter(user, portal) || user.onboardedAt) return null;
  if (portal === "app" && !user.flat) return null;
  if (portal === "manager" && user.staff?.community.status !== "APPROVED") return null;
  const text = messages().onboarding;
  return <OnboardingTour userId={user.id} cards={text[portal]} text={{ title: text.title, skip: text.skip, next: text.next, done: text.done, step: text.step }} />;
}

function Tour({ portal }: { portal: Portal }) {
  return (
    <Suspense fallback={null}>
      <FirstLoginTour portal={portal} />
    </Suspense>
  );
}

/** The top bar: what goes on the left (logo, menu, portal), then the bell and the account menu. */
function Navbar({ portal, width, children }: { portal: Portal; width: string; children: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface print:hidden">
      <div className={cn("mx-auto flex h-14 items-center gap-3 px-4 md:px-6", width)}>
        {children}
        <span className="hidden min-w-0 sm:block">
          <Suspense fallback={<InlineSkeleton />}>
            <ContextName portal={portal} />
          </Suspense>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell portal={portal} />
          <Account portal={portal} />
        </div>
      </div>
    </header>
  );
}

/** The left column on wide screens: the logo, the portal name and its navigation. */
function Sidebar({ portal, children }: { portal: Portal; children: ReactNode }) {
  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:gap-5 md:border-r md:border-border md:bg-surface md:px-3 md:py-4 print:hidden">
      <div className="space-y-1 px-3">
        <Logo href={PORTAL_PATH[portal]} />
        <p>
          <PortalName portal={portal} />
        </p>
      </div>
      {children}
    </aside>
  );
}

/** Residents and technicians: a bottom tab bar for one-handed use. Residents get a sidebar on wide screens. */
export function TabShell({ portal, children }: { portal: TabPortal; children: ReactNode }) {
  const wideSidebar = portal === "app";
  const width = portal === "tech" ? "max-w-xl" : "max-w-3xl";
  return (
    <div data-portal={portal} className="min-h-dvh bg-bg md:flex">
      {wideSidebar && (
        <Sidebar portal={portal}>
          <PortalNav portal={portal} fallback={<SideNavList items={PORTAL_NAV[portal]} pathname="" />}>
            <ActiveSideNav portal={portal} />
          </PortalNav>
        </Sidebar>
      )}
      <div className="min-w-0 flex-1">
        <Navbar portal={portal} width={width}>
          <span className={cn(wideSidebar && "md:hidden")}>
            <Logo href={PORTAL_PATH[portal]} compact />
          </span>
          <span className={cn(wideSidebar && "md:hidden")}>
            <PortalName portal={portal} />
          </span>
        </Navbar>
        <main className={cn("mx-auto w-full px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] print:p-0", width, wideSidebar && "md:px-6 md:pb-12")}>{children}</main>
      </div>
      <div className="print:hidden">
        <PortalNav portal={portal} fallback={<TabList portal={portal} pathname="" />}>
          <ActiveTabBar portal={portal} />
        </PortalNav>
      </div>
      <Tour portal={portal} />
    </div>
  );
}

/** Society Managers, vendors and admins: a sidebar on wide screens that becomes a drawer on phones. */
export function StaffShell({ portal, children }: { portal: StaffPortal; children: ReactNode }) {
  const nav = (
    <PortalNav portal={portal} fallback={<SideNavList items={PORTAL_NAV[portal]} pathname="" />}>
      <ActiveSideNav portal={portal} />
    </PortalNav>
  );
  const drawer = (
    <Sheet title={t(PORTAL_NAME[portal])} triggerLabel={t("common.menu")} trigger={<Menu aria-hidden className="size-5" />} side="left">
      {nav}
    </Sheet>
  );
  return (
    <div data-portal={portal} className="min-h-dvh bg-bg md:flex">
      <Sidebar portal={portal}>{nav}</Sidebar>
      <div className="min-w-0 flex-1">
        <Navbar portal={portal} width="max-w-5xl">
          {/* Static, so a tap never lands on a copy that is about to be replaced; hidden by CSS on the
              wrong-portal page (see [data-owner-only] in globals.css). */}
          <span className="-ml-2 md:hidden" data-owner-only>
            {drawer}
          </span>
          <span className="md:hidden">
            <PortalName portal={portal} />
          </span>
        </Navbar>
        <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">{children}</main>
      </div>
      <Tour portal={portal} />
    </div>
  );
}

// The public pages' shell is in public-shell.tsx: importing it must not pull the portals'
// navigation (and all its icons) into the landing and login pages' JavaScript.
