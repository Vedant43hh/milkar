import type { Metadata } from "next";
import { Suspense } from "react";
import { PollForm } from "@/components/manager/poll-form";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { listCatalogue, listServices } from "@/server/rounds";

export const metadata: Metadata = { title: t("manager.newPoll") };

export default function NewPollPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <NewPoll />
    </Suspense>
  );
}

async function NewPoll() {
  await requirePortal("manager");
  const [services, products] = await Promise.all([listServices(), listCatalogue()]);
  return (
    <div>
      <PageHeader title={t("manager.newPoll")} subtitle={t("manager.polls.intro")} />
      <PollForm
        text={messages().manager}
        targets={{
          services: services.map((s) => ({ id: s.id, label: `${s.name} · ${s.vendor.name}` })),
          products: products.map((p) => ({ id: p.id, label: p.name })),
        }}
        defaultTarget={services[0] ? `service:${services[0].id}` : "other"}
      />
    </div>
  );
}
