import { Building2, CircleAlert, Info } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { getCurrentUser, loginPath } from "@/lib/auth/current-user";
import { getCommunityInvite } from "@/server/auth";
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
  const [community, user] = await Promise.all([getCommunityInvite(code), getCurrentUser()]);
  if (!community) {
    return (
      <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
        {t("join.invalidLink")}
      </Banner>
    );
  }

  const invitePath = `/join/${community.code}${round ? `?round=${round}` : ""}`;
  const header = (
    <>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-soft-fg">
        <Building2 aria-hidden className="size-4" />
        {t("join.invitedTo", { community: community.name, city: community.city })}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("join.heading")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t("join.pitch", { community: community.name })}</p>
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

  if (user.role !== "RESIDENT") {
    return (
      <>
        {header}
        <Banner icon={<Info aria-hidden className="size-4" />}>{t("join.notForRole", { role: t(`roles.${user.role}`) })}</Banner>
      </>
    );
  }

  if (user.flat) {
    if (user.flat.community.id === community.id) redirect(round ? `/round/${round}` : "/app");
    return (
      <>
        {header}
        <Banner icon={<Info aria-hidden className="size-4" />}>{t("join.alreadyMember", { community: user.flat.community.name })}</Banner>
      </>
    );
  }

  return (
    <>
      {header}
      <Card>
        <JoinForm
          code={community.code}
          round={round}
          communityName={community.name}
          blockLabel={community.blockLabel}
          unitLabel={community.unitLabel}
          flats={community.flats}
          text={messages().join}
        />
      </Card>
    </>
  );
}
