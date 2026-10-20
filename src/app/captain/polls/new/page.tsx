import type { Metadata } from "next";
import { Suspense } from "react";
import { PollForm } from "@/components/captain/poll-form";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { listCatalogue, listServices } from "@/server/rounds";

export const metadata: Metadata = { title: t("captain.newPoll") };

export default function NewPollPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <NewPoll />
    </Suspense>
  );
}

async function NewPoll() {
  await requireArea("captain");
  const [services, products] = await Promise.all([listServices(), listCatalogue()]);
  return (
    <div>
      <PageHeader title={t("captain.newPoll")} subtitle={t("captain.polls.intro")} />
      <PollForm
        text={messages().captain}
        targets={{
          services: services.map((s) => ({ id: s.id, label: `${s.name} · ${s.vendor.name}` })),
          products: products.map((p) => ({ id: p.id, label: p.name })),
        }}
        defaultTarget={services[0] ? `service:${services[0].id}` : "other"}
      />
    </div>
  );
}
