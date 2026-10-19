import { ChevronRight, CircleAlert, ShieldCheck, Store, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/shells";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor, safeNextPath } from "@/lib/auth/rules";
import { DEMO_USER_KEYS, DEMO_USERS } from "@/lib/demo";
import { getEnv } from "@/lib/env";
import { demoLoginAction } from "@/server/actions/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: t("auth.loginTitle") };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold tracking-tight">{t("auth.loginHeading")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t("auth.loginIntro")}</p>
      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        }
      >
        <LoginSection searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function LoginSection({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homePathFor(user));

  const env = getEnv();
  return (
    <div className="space-y-6">
      {params.error === "demo" && (
        <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
          {t("errors.demoDisabled")}
        </Banner>
      )}
      <Card>
        <LoginForm next={next} mockOtp={env.OTP_MODE === "mock"} />
      </Card>
      {env.DEMO_MODE && <DemoLogins next={next} />}
    </div>
  );
}

const DEMO_ICONS = { ADMIN: ShieldCheck, CAPTAIN: Users, RESIDENT: UserRound, SUPPLIER: Store } as const;

function DemoLogins({ next }: { next: string | null }) {
  return (
    <section aria-labelledby="demo-heading">
      <h2 id="demo-heading" className="font-semibold">
        {t("auth.demoHeading")}
      </h2>
      <p className="mb-3 text-sm text-muted">{t("auth.demoIntro")}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {DEMO_USER_KEYS.map((key) => {
          const demo = DEMO_USERS[key];
          const Icon = DEMO_ICONS[demo.role];
          return (
            <li key={key}>
              <form action={demoLoginAction}>
                <input type="hidden" name="key" value={key} />
                <input type="hidden" name="next" value={next ?? ""} />
                <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{t("auth.demoAs", { name: demo.name })}</span>
                    <span className="block text-xs text-muted">
                      {t(`roles.${demo.role}`)}
                      {demo.flat ? ` · ${demo.flat}` : ""}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 text-subtle" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
