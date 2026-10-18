import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "@/server/actions/auth";

/** Signed-in name and a logout button. Reads the session, so render it inside <Suspense>. */
export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const firstName = user.name?.split(" ")[0] ?? user.phone.slice(-4);
  return (
    <form action={logoutAction} className="flex items-center gap-3 text-sm">
      <span className="text-stone-600">{firstName}</span>
      <button type="submit" className="min-h-11 text-teal-800 underline-offset-4 hover:underline">
        {t("common.logout")}
      </button>
    </form>
  );
}
