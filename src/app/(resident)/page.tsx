import { CalendarClock, ChevronRight, Megaphone, ShieldCheck, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResidentHome />
    </Suspense>
  );
}

async function ResidentHome() {
  const user = await requireArea("resident");
  return (
    <div>
      <PageHeader
        title={t("home.greeting", { name: user.name?.split(" ")[0] ?? "" })}
        subtitle={t("home.flatIn", { unit: user.flat.community.unitLabel, flat: `${user.flat.tower}-${user.flat.number}`, community: user.flat.community.name })}
      />

      {user.role === "CAPTAIN" && (
        <Link
          href="/captain"
          className="group flex items-center gap-3 rounded-card border border-accent/40 bg-accent-soft p-4 text-accent-soft-fg transition-colors hover:border-accent"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <ShieldCheck aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("home.captainTools")}</span>
            <span className="block text-sm opacity-90">{t("home.captainHint")}</span>
          </span>
          <ChevronRight aria-hidden className="size-5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <SectionTitle>{t("home.activeRounds")}</SectionTitle>
      <EmptyState icon={<ShoppingBasket aria-hidden className="size-6" />} title={t("home.activeRoundsEmpty")} body={t("home.activeRoundsEmptyBody")} />

      <SectionTitle>{t("home.upcomingVisits")}</SectionTitle>
      <EmptyState icon={<CalendarClock aria-hidden className="size-6" />} title={t("home.upcomingVisitsEmpty")} />

      <SectionTitle>{t("home.polls")}</SectionTitle>
      <EmptyState icon={<Megaphone aria-hidden className="size-6" />} title={t("home.pollsEmpty")} />
    </div>
  );
}
