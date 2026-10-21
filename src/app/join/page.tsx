import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/public-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { Input, Label } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";
import { goToInviteAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: t("join.title") };

export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold tracking-tight">{t("join.heading")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t("join.codeIntro")}</p>
      <Suspense fallback={<Skeleton className="h-32" />}>
        <JoinCodeSection searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function JoinCodeSection({ searchParams }: { searchParams: PageProps<"/join">["searchParams"] }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  // Members, vendors and admins have nothing to join here.
  if (user && (user.role !== "RESIDENT" || user.flatId)) redirect(homePathFor(user));

  return (
    <Card>
      <form action={goToInviteAction} className="space-y-4">
        <div>
          <Label htmlFor="code">{t("join.codeLabel")}</Label>
          <Input id="code" name="code" autoCapitalize="characters" autoComplete="off" placeholder={t("join.codePlaceholder")} className="uppercase" required />
        </div>
        {params.error === "code" && (
          <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
            {t("errors.unknownCommunity")}
          </Banner>
        )}
        <Button block>{t("common.continue")}</Button>
      </form>
    </Card>
  );
}
