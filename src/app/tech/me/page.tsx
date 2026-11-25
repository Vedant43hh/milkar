import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatPhone } from "@/lib/phone";
import { logoutAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: t("tech.meTitle") };

export default function TechnicianMePage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Me />
    </Suspense>
  );
}

async function Me() {
  const user = await requirePortal("tech");
  return (
    <div className="space-y-4">
      <PageHeader title={user.name ?? formatPhone(user.phone)} subtitle={t("tech.worksFor", { vendor: user.vendor.name })} />
      <form action={logoutAction}>
        <Button variant="secondary" block size="lg" icon={<LogOut aria-hidden className="size-5" />}>
          {t("common.logout")}
        </Button>
      </form>
    </div>
  );
}
