import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AppShell, ButtonLink, Card, ErrorText, Notice, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { getCurrentUser, loginPath } from "@/lib/auth/current-user";
import { getSocietyInvite } from "@/server/auth";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: t("join.title") };

export default function InvitePage({ params, searchParams }: PageProps<"/join/[code]">) {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <Suspense fallback={<Skeleton lines={4} />}>
        <Invite params={params} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

const ROUND_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function Invite({ params, searchParams }: Pick<PageProps<"/join/[code]">, "params" | "searchParams">) {
  // Database reads are request-time only (they're never cached), so opt out of prerendering first.
  await connection();
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const round = typeof query.round === "string" && ROUND_ID.test(query.round) ? query.round : null;
  const [society, user] = await Promise.all([getSocietyInvite(code), getCurrentUser()]);
  if (!society) return <ErrorText>{t("join.invalidLink")}</ErrorText>;

  const invitePath = `/join/${society.code}${round ? `?round=${round}` : ""}`;
  const header = (
    <>
      <p className="text-sm font-medium text-teal-800">{t("join.invitedTo", { society: society.name, city: society.city })}</p>
      <h1 className="mt-1 text-xl font-semibold">{t("join.heading")}</h1>
      <p className="mt-1 mb-6 text-sm text-stone-600">{t("join.pitch", { society: society.name })}</p>
    </>
  );

  if (!user) {
    return (
      <>
        {header}
        <ButtonLink href={loginPath(invitePath)}>{t("join.loginToJoin")}</ButtonLink>
      </>
    );
  }

  if (user.role === "SUPPLIER" || user.role === "ADMIN") {
    return (
      <>
        {header}
        <Notice>{t("join.notForRole", { role: t(`roles.${user.role}`) })}</Notice>
      </>
    );
  }

  if (user.flat) {
    if (user.flat.society.id === society.id) redirect(round ? `/round/${round}` : "/");
    return (
      <>
        {header}
        <Notice>{t("join.alreadyMember", { society: user.flat.society.name })}</Notice>
      </>
    );
  }

  return (
    <>
      {header}
      <Card>
        <JoinForm code={society.code} round={round} societyName={society.name} flats={society.flats} />
      </Card>
    </>
  );
}
