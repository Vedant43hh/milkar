import { Card } from "@/components/ui";
import { t } from "@/i18n";
import type { SessionUser } from "@/lib/auth/current-user";

/** Temporary landing page for an area that a later phase builds out. */
export function AreaPlaceholder({ title, user, phase }: { title: string; user: SessionUser; phase: number }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-stone-600">
        {t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })}
      </p>
      <Card>
        <p className="text-sm text-stone-600">{t("common.comingSoon", { phase })}</p>
      </Card>
    </div>
  );
}
