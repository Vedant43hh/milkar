import { Building2, CircleAlert, Info } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/shells";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { getCurrentUser, loginPath } from "@/lib/auth/current-user";
import { getSocietyInvite } from "@/server/auth";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: t("join.title") };

export default function InvitePage({ params, searchParams }: PageProps<"/join/[code]">) {
  return (
    <PublicShell>
      <Suspense fallback={<PageSkeleton cards={1} />}>
        <Invite params={params} searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

const ROUND_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function Invite({ params, searchParams }: Pick<PageProps<"/join/[code]">, "params" | "searchParams">) {
  // Database reads are request-time only (they're never cached), so opt out of prerendering first.
  await connection();
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const round = typeof query.round === "string" && ROUND_ID.test(query.round) ? query.round : null;
  const [society, user] = await Promise.all([getSocietyInvite(code), getCurrentUser()]);
  if (!society) {
    return (
      <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
        {t("join.invalidLink")}
      </Banner>
    );
  }

  const invitePath = `/join/${society.code}${round ? `?round=${round}` : ""}`;
  const header = (
    <>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-soft-fg">
        <Building2 aria-hidden className="size-4" />
        {t("join.invitedTo", { society: society.name, city: society.city })}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("join.heading")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t("join.pitch", { society: society.name })}</p>
    </>
  );

  if (!user) {
    return (
      <>
        {header}
        <ButtonLink href={loginPath(invitePath)} block>
          {t("join.loginToJoin")}
        </ButtonLink>
      </>
    );
  }

  if (user.role === "SUPPLIER" || user.role === "ADMIN") {
    return (
      <>
        {header}
        <Banner icon={<Info aria-hidden className="size-4" />}>{t("join.notForRole", { role: t(`roles.${user.role}`) })}</Banner>
      </>
    );
  }

  if (user.flat) {
    if (user.flat.society.id === society.id) redirect(round ? `/round/${round}` : "/");
    return (
      <>
        {header}
        <Banner icon={<Info aria-hidden className="size-4" />}>{t("join.alreadyMember", { society: user.flat.society.name })}</Banner>
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
