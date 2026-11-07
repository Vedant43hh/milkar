import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatPhone } from "@/lib/phone";
import { formatIST } from "@/lib/time";
import { createAdminAction } from "@/server/actions/admin";
import { listAdmins } from "@/server/admin";

export const metadata: Metadata = { title: t("adminAdmins.title") };

export default function AdminsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Admins />
    </Suspense>
  );
}

/** Adding an admin: the only way one is made (registration never offers it). */
async function Admins() {
  await requirePortal("admin");
  const admins = await listAdmins();
  return (
    <div className="space-y-5">
      <PageHeader title={t("adminAdmins.title")} subtitle={t("adminAdmins.intro")} />
      <Card labelledBy="add-admin">
        <CardHeader titleId="add-admin" title={t("adminAdmins.add")} />
        <ActionForm action={createAdminAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field id="admin-name" label={t("adminAdmins.name")}>
            {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={60} autoComplete="off" />}
          </Field>
          <Field id="admin-phone" label={t("adminAdmins.phone")}>
            {(aria) => <Input {...aria} name="phone" type="tel" inputMode="numeric" required autoComplete="off" placeholder="98765 43210" />}
          </Field>
          <SubmitButton icon={<UserPlus aria-hidden className="size-4" />}>{t("adminAdmins.submit")}</SubmitButton>
        </ActionForm>
      </Card>
      <section aria-labelledby="admins-list">
        <SectionTitle>
          <span id="admins-list">{t("adminAdmins.list", { n: admins.length })}</span>
        </SectionTitle>
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium text-fg">{a.name}</span>
              <span className="text-muted tabular-nums">
                {formatPhone(a.phone)} · {t("adminAdmins.since", { when: formatIST(a.createdAt, "date") })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
