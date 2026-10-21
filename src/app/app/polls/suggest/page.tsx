import type { Metadata } from "next";
import { Suspense } from "react";
import { SuggestForm } from "@/components/polls/suggest-form";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { listServices } from "@/server/rounds";

export const metadata: Metadata = { title: t("polls.suggest") };

export default function SuggestPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <Suggest />
    </Suspense>
  );
}

async function Suggest() {
  await requirePortal("app");
  const services = await listServices();
  return (
    <div>
      <PageHeader title={t("polls.suggest")} subtitle={t("polls.intro")} />
      <SuggestForm services={services.map((s) => ({ id: s.id, label: s.name }))} text={messages().polls.form} />
    </div>
  );
}
