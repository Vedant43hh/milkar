import { ArrowLeft, ArrowRight, Building2, CircleAlert, Store, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ManagerWizard, ResidentWizard, VendorWizard } from "@/components/register/wizards";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";
import { getEnv } from "@/lib/env";
import { communityForJoining } from "@/server/registration";

export const metadata: Metadata = { title: t("register.title") };

const ROLES: { role: "RESIDENT" | "MANAGER" | "VENDOR"; slug: "resident" | "manager" | "vendor"; icon: LucideIcon; portal: string }[] = [
  { role: "RESIDENT", slug: "resident", icon: UserRound, portal: "app" },
  { role: "MANAGER", slug: "manager", icon: Building2, portal: "manager" },
  { role: "VENDOR", slug: "vendor", icon: Store, portal: "vendor" },
];

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <PublicShell>
      <Suspense fallback={<PageSkeleton cards={2} />}>
        <Register searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function Register({ searchParams }: { searchParams: PageProps<"/register">["searchParams"] }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : "";
  const chosen = ROLES.find((r) => r.slug === params.role);

  const user = await getCurrentUser();
  if (user) {
    // A resident account without a flat finishes joining in its own portal.
    if (user.role === "RESIDENT" && !user.flatId) redirect(code ? `/app/join?code=${code}` : "/app/join");
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("register.heading")}</h1>
        <ButtonLink href={homePathFor(user)} block icon={<ArrowRight aria-hidden className="size-4" />}>
          {t("portals.goToMine")}
        </ButtonLink>
      </div>
    );
  }

  if (!chosen) return <RoleChoice />;

  const text = messages().register;
  const mockOtp = getEnv().OTP_MODE === "mock";
  const invited = chosen.role === "RESIDENT" && code ? await communityForJoining({ code }) : null;
  return (
    <div data-portal={chosen.portal} className="space-y-5">
      <Link href="/register" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="size-4" />
        {t("register.otherRole")}
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          <chosen.icon aria-hidden className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t(`register.roles.${chosen.role}.title`)}</h1>
      </div>
      {chosen.role === "RESIDENT" && code && !invited && (
        <Banner tone="warning" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
          {t("join.invalidLink")}
        </Banner>
      )}
      <Card>
        {chosen.role === "RESIDENT" ? (
          <ResidentWizard text={text} mockOtp={mockOtp} initial={invited} />
        ) : chosen.role === "MANAGER" ? (
          <ManagerWizard text={text} mockOtp={mockOtp} />
        ) : (
          <VendorWizard text={text} mockOtp={mockOtp} />
        )}
      </Card>
      <p className="text-center text-sm text-muted">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
          {t("register.login")}
        </Link>
      </p>
    </div>
  );
}

/** "How will you use Milkar?": one card per role anyone may register as. */
function RoleChoice() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("register.heading")}</h1>
        <p className="text-muted">{t("register.intro")}</p>
      </div>
      <ul className="space-y-3">
        {ROLES.map(({ role, slug, icon: Icon, portal }) => (
          <li key={role} data-portal={portal}>
            <Link
              href={`/register?role=${slug}`}
              className="group flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Icon aria-hidden className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{t(`register.roles.${role}.title`)}</span>
                <span className="block text-sm text-muted">{t(`register.roles.${role}.body`)}</span>
              </span>
              <ArrowRight aria-hidden className="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-sm text-muted">
        <Wrench aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("register.technicianNote")}
      </p>
      <p className="text-center text-sm text-muted">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
          {t("register.login")}
        </Link>
      </p>
    </div>
  );
}
