import { ArrowRight, LogOut } from "lucide-react";
import Link from "next/link";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor, type Portal } from "@/lib/auth/rules";
import { formatPhone } from "@/lib/phone";
import { logoutAction } from "@/server/actions/auth";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";

function initials(name: string | null, phone: string): string {
  if (!name) return phone.slice(-2);
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Account sheet: who you are, and log out. Reads the session, so render it inside <Suspense>.
 * Signed-out visitors get nothing here (the public pages have their own log-in links). Outside
 * their own portal (`portal` is where the menu is shown; null on public pages) it offers the way back.
 */
export async function AccountMenu({ portal }: { portal: Portal | null }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const home = homePathFor(user);
  const away = portal === null || home !== `/${portal}`;
  const community = user.flat?.community ?? user.staff?.community;
  return (
    <Sheet
      title={t("account.title")}
      triggerLabel={t("account.open")}
      trigger={
        <span className="flex size-8 items-center justify-center rounded-full bg-neutral-soft text-xs font-semibold text-neutral">{initials(user.name, user.phone)}</span>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-fg">{user.name ?? formatPhone(user.phone)}</p>
          <p className="text-sm text-muted">{formatPhone(user.phone)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="info">{t(`roles.${user.role}`)}</Badge>
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
          <Link href={home} className="flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm font-medium text-accent transition-colors hover:bg-surface-hover">
            <ArrowRight aria-hidden className="size-4" />
            {t("portals.goToMine")}
          </Link>
        )}

        <form action={logoutAction}>
          <Button variant="secondary" block icon={<LogOut aria-hidden className="size-4" />}>
            {t("common.logout")}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
