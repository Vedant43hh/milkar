import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AppShell, Button, ErrorText, Input, Label, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";
import { goToInviteAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: t("join.title") };

export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <h1 className="text-xl font-semibold">{t("join.heading")}</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">{t("join.codeIntro")}</p>
      <Suspense fallback={<Skeleton lines={2} />}>
        <JoinCodeSection searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function JoinCodeSection({ searchParams }: { searchParams: PageProps<"/join">["searchParams"] }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  // Members, suppliers and admins have nothing to join here.
  if (user && (user.flatId || user.role === "SUPPLIER" || user.role === "ADMIN")) redirect(homePathFor(user));

  return (
    <form action={goToInviteAction} className="space-y-4">
      <div>
        <Label htmlFor="code">{t("join.codeLabel")}</Label>
        <Input id="code" name="code" autoCapitalize="characters" autoComplete="off" placeholder={t("join.codePlaceholder")} required />
      </div>
      {params.error === "code" && <ErrorText>{t("errors.unknownSociety")}</ErrorText>}
      <Button>{t("common.continue")}</Button>
    </form>
  );
}
