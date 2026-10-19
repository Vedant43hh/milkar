import type { LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { t, type MessageKey } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import type { Area } from "@/lib/auth/rules";
import { PageHeader } from "./ui/card";
import { EmptyState } from "./ui/display";
import { PageSkeleton } from "./ui/skeleton";

/** A screen whose real content arrives in a later phase. Still enforces access for its area. */
export function PlaceholderPage({ area, title, body, icon: Icon }: { area: Area; title: MessageKey; body: MessageKey; icon: LucideIcon }) {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <Guarded area={area}>
        <PageHeader title={t(title)} />
        <EmptyState icon={<Icon aria-hidden className="size-6" />} title={t(title)} body={t(body)} />
      </Guarded>
    </Suspense>
  );
}

async function Guarded({ area, children }: { area: Area; children: React.ReactNode }) {
  await requireArea(area);
  return <>{children}</>;
}
