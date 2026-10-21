import { ArrowRight, LogOut, Palette } from "lucide-react";
import Link from "next/link";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor, type Portal } from "@/lib/auth/rules";
import { formatPhone } from "@/lib/phone";
import { logoutAction } from "@/server/actions/auth";
import { ThemeToggle } from "../theme";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";

function initials(name: string | null, phone: string): string {
  if (!name) return phone.slice(-2);
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Theme-only menu for signed-out visitors (and the fallback while the session loads). */
export function ThemeMenu() {
  return (
    <Sheet title={t("account.displayOptions")} triggerLabel={t("account.displayOptions")} trigger={<Palette aria-hidden className="size-5 text-muted" />}>
      <p className="mb-2 text-sm font-medium">{t("account.appearance")}</p>
      <ThemeToggle />
    </Sheet>
  );
}

/**
 * Account sheet: who you are, theme and logout. Reads the session, so render it inside <Suspense>.
 * Signed-out visitors get the theme-only menu. Outside their own portal (`portal` is where the
 * menu is shown; null on public pages) it offers the way back.
 */
export async function AccountMenu({ portal }: { portal: Portal | null }) {
  const user = await getCurrentUser();
  if (!user) return <ThemeMenu />;

  const home = homePathFor(user);
  const away = portal === null || home !== `/${portal}`;
  const community = user.flat?.community ?? user.staff?.community;
  return (
    <Sheet
      title={t("account.title")}
      triggerLabel={t("account.open")}
      trigger={
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-fg">
          {initials(user.name, user.phone)}
        </span>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-lg font-semibold">{user.name ?? formatPhone(user.phone)}</p>
          <p className="text-sm text-muted">{formatPhone(user.phone)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brand">{t(`roles.${user.role}`)}</Badge>
            {user.flat ? (
              <Badge>
                {user.flat.community.unitLabel} {user.flat.tower}-{user.flat.number} · {user.flat.community.name}
              </Badge>
            ) : (
              community && <Badge>{community.name}</Badge>
            )}
            {user.vendor && <Badge>{user.vendor.name}</Badge>}
          </div>
        </div>

        {away && (
          <Link href={home} className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3 text-sm font-medium hover:bg-surface-2">
            <ArrowRight aria-hidden className="size-5 text-brand" />
            {t("portals.goToMine")}
          </Link>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">{t("account.appearance")}</p>
          <ThemeToggle />
        </div>

        <form action={logoutAction}>
          <Button variant="secondary" block icon={<LogOut aria-hidden className="size-4" />}>
            {t("common.logout")}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
