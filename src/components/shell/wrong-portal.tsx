import { ArrowRight, LockKeyhole } from "lucide-react";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor, type Portal } from "@/lib/auth/rules";
import { logoutAction } from "@/server/actions/auth";
import { Button, ButtonLink } from "../ui/button";

/**
 * Shown by a portal's forbidden.tsx when someone opens another role's portal: whose area this is,
 * and a button to their own. Reads the session, so render it inside <Suspense>.
 */
export async function WrongPortal({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  return (
    <section aria-labelledby="wrong-portal" className="mx-auto max-w-md space-y-5 py-10 text-center">
      {/* Tells the portal's frame to hide its owner-only controls (the staff menu), see globals.css. */}
      <span data-wrong-portal hidden />
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
        <LockKeyhole aria-hidden className="size-7" />
      </span>
      <div className="space-y-2">
        <h1 id="wrong-portal" className="text-2xl font-semibold tracking-tight text-fg">
          {t(`portals.wrong.title.${portal}`)}
        </h1>
        {user && <p className="text-muted">{t("portals.wrong.body", { role: t(`roles.${user.role}`) })}</p>}
      </div>
      <div className="flex flex-col items-center gap-2">
        <ButtonLink href={user ? homePathFor(user) : "/login"} icon={<ArrowRight aria-hidden className="size-4" />}>
          {t("portals.goToMine")}
        </ButtonLink>
        {user && (
          <form action={logoutAction}>
            <Button variant="ghost">{t("portals.wrong.otherAccount")}</Button>
          </form>
        )}
      </div>
    </section>
  );
}
