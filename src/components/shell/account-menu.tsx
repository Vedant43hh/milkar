import { LogOut, Palette, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
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
 * Account sheet: who you are, quick links, theme and logout. Reads the session, so render it
 * inside <Suspense>. Signed-out visitors get the theme-only menu.
 */
export async function AccountMenu({ context }: { context: "resident" | "staff" | "public" }) {
  const user = await getCurrentUser();
  if (!user) return <ThemeMenu />;

  const isCaptain = user.role === "CAPTAIN";
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
            <Badge tone={isCaptain ? "accent" : "brand"} icon={isCaptain ? <ShieldCheck aria-hidden className="size-3.5" /> : undefined}>
              {t(`roles.${user.role}`)}
            </Badge>
            {user.flat && (
              <Badge>
                {user.flat.tower}-{user.flat.number} · {user.flat.society.name}
              </Badge>
            )}
            {user.supplier && <Badge>{user.supplier.name}</Badge>}
          </div>
        </div>

        {isCaptain && (
          <Link
            href={context === "staff" ? "/" : "/captain"}
            className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3 text-sm font-medium hover:bg-surface-2"
          >
            <Users aria-hidden className="size-5 text-brand" />
            {context === "staff" ? t("nav.residentApp") : t("nav.captain")}
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
