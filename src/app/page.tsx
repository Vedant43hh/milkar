import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AppShell, Card, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function Home() {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <Suspense fallback={<Skeleton lines={3} />}>
        <ResidentHome />
      </Suspense>
    </AppShell>
  );
}

async function ResidentHome() {
  const user = await requireArea("resident");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("home.greeting", { name: user.name ?? "" })}</h1>
        <p className="text-sm text-stone-600">
          {t("home.flatIn", { flat: `${user.flat.tower}-${user.flat.number}`, society: user.flat.society.name })}
        </p>
      </div>
      <Card>
        <p className="text-sm text-stone-600">{t("home.ordersComing")}</p>
      </Card>
      {user.role === "CAPTAIN" && (
        <Link href="/captain" className="block min-h-11 rounded-lg border border-teal-700 px-4 py-3 text-center font-medium text-teal-800">
          {t("home.captainTools")}
        </Link>
      )}
    </div>
  );
}
