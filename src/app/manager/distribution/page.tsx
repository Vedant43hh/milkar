import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState, ListRow } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { listDistributionRounds } from "@/server/distribution";

export const metadata: Metadata = { title: t("distribution.title") };

export default function DistributionPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Distribution />
    </Suspense>
  );
}

/** Grocery rounds to hand out, and the ones already done. */
async function Distribution() {
  const user = await requirePortal("manager");
  const rounds = await listDistributionRounds(user.staff.community.id);
  const toDo = rounds.filter((r) => r.status === "FINALIZED");
  const done = rounds.filter((r) => r.status === "COMPLETED");
  const list = (items: typeof rounds) => (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {items.map((r) => (
        <li key={r.id}>
          <ListRow
            href={`/manager/distribution/${r.id}`}
            title={r.title}
            subtitle={
              <>
                {t("distribution.deliveredOn", { when: formatIST(r.deliveryAt) })} · {t("distribution.progress", { collected: r.progress.collected, total: r.progress.total })}
              </>
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader title={t("distribution.title")} subtitle={t("distribution.intro")} />
      {rounds.length === 0 ? (
        <EmptyState title={t("distribution.none")} body={t("distribution.noneBody")} />
      ) : (
        <>
          {toDo.length > 0 && (
            <section aria-labelledby="to-hand-out">
              <SectionTitle>
                <span id="to-hand-out">{t("distribution.toHandOut")}</span>
              </SectionTitle>
              {list(toDo)}
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="handed-out">
              <SectionTitle>
                <span id="handed-out">{t("distribution.done")}</span>
              </SectionTitle>
              {list(done)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
